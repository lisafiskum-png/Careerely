import 'server-only'
import { normalizeResume, normalizeSuggestions, type ParseResult } from './schema'

const SECTION = {
  profile: /^(profile|professional summary|summary|about me)$/i,
  skills: /^(core expertise|core skills|skills|key skills|competencies|technical skills)$/i,
  experience: /^(professional experience|work experience|employment|experience)$/i,
  education: /^(education(?:\s*&\s*certifications?)?|academic background|qualifications)$/i,
  tail: /^(systems?\s*&\s*languages?|languages?|certifications?|references?)$/i,
}

const BULLET = /^[\s\u2022\u2023\u25e6\u2043\u2219\uf0b7▪●–—-]+/
const DATE_RANGE = /^(.*?)\s*[–—-]\s*(present|current|now|.*?)$/i

function cleanLine(value: string): string {
  return value.replace(BULLET, '').replace(/\s+/g, ' ').trim()
}

function nonEmptyLines(text: string): string[] {
  return text.split('\n').map(cleanLine).filter(Boolean)
}

function section(lines: string[], start: RegExp, ends: RegExp[]): string[] {
  const startAt = lines.findIndex(line => start.test(line))
  if (startAt < 0) return []
  const rest = lines.slice(startAt + 1)
  const endAt = rest.findIndex(line => ends.some(pattern => pattern.test(line)))
  return endAt < 0 ? rest : rest.slice(0, endAt)
}

function firstEmail(text: string): string {
  // PDF text layers sometimes wrap immediately before the final ".com".
  const joined = text.replace(/([\w.%+-]+@[\w.-]+)\s*\n\s*(\.[a-z]{2,})/gi, '$1$2')
  return joined.match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? ''
}

function firstPhone(lines: string[]): string {
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,15}/)
    if (match && match[0].replace(/\D/g, '').length >= 7) return match[0].trim()
  }
  return ''
}

function splitList(value: string): string[] {
  return value.split(/[,;|•·]/).map(cleanLine).filter(Boolean)
}

function parseDateRange(value: string): { start: string; end: string; current: boolean } {
  const match = value.match(DATE_RANGE)
  if (!match) return { start: value, end: '', current: false }
  const current = /^(present|current|now)$/i.test(match[2].trim())
  return { start: match[1].trim(), end: current ? '' : match[2].trim(), current }
}

function isDateLine(value: string): boolean {
  return /\b(?:19|20)\d{2}\b/.test(value) && (/[–—-]/.test(value) || /\bpresent\b|\bcurrent\b/i.test(value))
}

function parseExperience(lines: string[]) {
  const result: ParseResult['resume']['experience'] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]
    const divider = header.includes('|') ? '|' : header.includes(' at ') ? ' at ' : ''
    if (!divider || isDateLine(header)) continue
    const [title = '', company = ''] = header.split(divider, 2).map(cleanLine)
    if (!title || !company) continue

    const entry = { title, company, location: '', start: '', end: '', current: false, highlights: [] as string[] }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor]
      if ((next.includes('|') || next.includes(' at ')) && !isDateLine(next)) break
      if (!entry.start && isDateLine(next)) Object.assign(entry, parseDateRange(next))
      else if (!entry.location && /,/.test(next) && next.length < 100) entry.location = next
      else if (!isDateLine(next) && next.length > 20) entry.highlights.push(next)
      index = cursor
    }
    result.push(entry)
  }
  return result
}

function parseEducation(lines: string[]) {
  const education: ParseResult['resume']['education'] = []
  const certifications: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]
    if (!header.includes('|')) continue
    const [institution = '', dates = ''] = header.split('|', 2).map(cleanLine)
    const next = lines[index + 1] && !lines[index + 1].includes('|') ? lines[index + 1] : ''
    const academic = /(university|school|college|academy|institute|universitet|høyskole|business school)/i.test(institution)
    if (academic) {
      const parsedDates = parseDateRange(dates)
      education.push({ institution, degree: next, field: '', start: parsedDates.start, end: parsedDates.current ? '' : parsedDates.end })
    } else if (next) {
      certifications.push(`${next} — ${institution}${dates ? ` (${dates})` : ''}`)
    }
  }
  return { education, certifications }
}

function inferIndustries(text: string): string[] {
  const matches: Array<[RegExp, string]> = [
    [/\b(human resources?|people operations?|employee relations?|hris)\b/i, 'Human Resources'],
    [/\b(recruit(?:ment|er|ing)|talent acquisition|staffing)\b/i, 'Recruitment'],
    [/\b(software|technology|saas|tech)\b/i, 'Technology'],
    [/\b(retail|store operations?)\b/i, 'Retail'],
    [/\b(bank|banking|financial services?|fintech)\b/i, 'Financial Services'],
    [/\b(marketing|advertising|brand)\b/i, 'Marketing'],
    [/\b(sales|business development|account executive)\b/i, 'Sales'],
  ]
  return matches.filter(([pattern]) => pattern.test(text)).map(([, value]) => value)
}

/**
 * Deterministic degraded-mode parser. It never invents facts and keeps
 * onboarding available when the AI provider is temporarily unavailable.
 * The candidate reviews every extracted field before it is saved.
 */
export function parseResumeFallback(text: string): ParseResult {
  const lines = nonEmptyLines(text)
  const profileLines = section(lines, SECTION.profile, [SECTION.skills, SECTION.experience, SECTION.education, SECTION.tail])
  const skillLines = section(lines, SECTION.skills, [SECTION.experience, SECTION.education, SECTION.tail])
  const experienceLines = section(lines, SECTION.experience, [SECTION.education, SECTION.tail])
  const educationLines = section(lines, SECTION.education, [SECTION.tail])
  const experience = parseExperience(experienceLines)
  const parsedEducation = parseEducation(educationLines)

  const firstSection = lines.findIndex(line => Object.values(SECTION).some(pattern => pattern.test(line)))
  const header = lines.slice(0, firstSection < 0 ? 12 : firstSection)
  const email = firstEmail(text)
  const phone = firstPhone(header)
  const links: string[] = text.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|[\w-]+\.(?:com|io|dev))\/[^\s)]+/gi) ?? []
  const location = header.find(line => line.includes(',') && line.length < 100 && !line.includes('@')) ?? ''
  const fullName = header.find(line => /^[\p{L}][\p{L}' -]{2,80}$/u.test(line) && line === line.toUpperCase()) ?? header[0] ?? ''
  const headline = header.find(line => line !== fullName && line !== location && line !== phone && !line.includes('@') && !links.includes(line) && /[\p{L}]/u.test(line)) ?? experience[0]?.title ?? ''

  const languageLine = lines.find(line => /^languages?\s*:/i.test(line))
  const languages = languageLine ? splitList(languageLine.replace(/^languages?\s*:/i, '')) : []
  const systemsLine = lines.find(line => /^systems?\s*:/i.test(line))
  const skills = [...skillLines.flatMap(splitList), ...(systemsLine ? splitList(systemsLine.replace(/^systems?\s*:/i, '')) : [])]
  const { education, certifications } = parsedEducation

  const resume = normalizeResume({
    full_name: fullName,
    headline,
    email,
    phone,
    location,
    links,
    summary: profileLines.join(' '),
    experience,
    education,
    skills,
    languages,
    certifications,
  })

  return {
    resume,
    suggestions: normalizeSuggestions({
      roles: experience.map(item => item.title),
      industries: inferIndustries(text),
      highlights: [
        experience.length ? `${experience.length} roles found` : '',
        skills.length ? `${skills.length} skills found` : '',
        languages.length ? `${languages.length} languages found` : '',
      ].filter(Boolean),
    }),
  }
}
