import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ResumeSchema, type Resume } from '../resume/schema'
import type { Preferences } from './filter'
import type { WorkStyle } from './schema'

// Everything the engine knows about a user for one search: the reviewed
// resume and the explicit preferences (the only active preference layer in V1).

export type SearchContext = {
  userId: string
  searchId: string
  prefs: Preferences
  resume: Resume
  resumeText: string
  /** Resume corpus used to verify quotes: raw text + the reviewed resume. */
  resumeCorpus: string
  /** Compact resume given to the model. */
  resumeForPrompt: string
  preferencesText: string
}

const WORK_STYLE_LABEL: Record<WorkStyle, string> = { remote: 'Remote', hybrid: 'Hybrid', on_site: 'On-site' }

export function flattenResume(r: Resume): string {
  const lines: string[] = [r.full_name, r.headline, r.location, r.summary]
  for (const e of r.experience) {
    lines.push(`${e.title} — ${e.company}${e.location ? `, ${e.location}` : ''} (${e.start}–${e.current ? 'present' : e.end})`)
    lines.push(...e.highlights.map(h => `• ${h}`))
  }
  for (const e of r.education) lines.push(`${e.degree} ${e.field}, ${e.institution} (${e.start}–${e.end})`)
  if (r.skills.length) lines.push(`Skills: ${r.skills.join(', ')}`)
  if (r.languages.length) lines.push(`Languages: ${r.languages.join(', ')}`)
  if (r.certifications.length) lines.push(`Certifications: ${r.certifications.join(', ')}`)
  return lines.filter(l => l && l.trim()).join('\n')
}

export function preferencesText(p: Preferences): string {
  return [
    `Target roles: ${p.roles.join('; ')}`,
    `Target industries: ${p.industries.join('; ') || 'not specified'}`,
    `Work styles: ${p.workStyles.map(w => WORK_STYLE_LABEL[w]).join('; ') || 'not specified'}`,
    `Preferred locations: ${p.locations.join('; ') || 'open to any location'}`,
    p.minCompensation ? `Minimum compensation: ${p.minCompensation.amount} ${p.minCompensation.currency}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export class ContextError extends Error {}

export async function loadSearchContext(admin: SupabaseClient, searchId: string): Promise<SearchContext> {
  const { data: search, error } = await admin
    .from('searches')
    .select('id, user_id, status, target_roles, industries, work_styles, locations, min_compensation')
    .eq('id', searchId)
    .maybeSingle()
  if (error) throw error
  if (!search) throw new ContextError('Search not found')

  const { data: career, error: careerError } = await admin
    .from('career_profiles')
    .select('resume_text, resume_data, resume_confirmed_at, min_compensation, compensation_currency')
    .eq('user_id', search.user_id)
    .maybeSingle()
  if (careerError) throw careerError
  const parsed = ResumeSchema.safeParse(career?.resume_data)
  if (!career?.resume_confirmed_at || !parsed.success) throw new ContextError('No confirmed resume')

  const floorAmount = search.min_compensation ?? career.min_compensation
  const prefs: Preferences = {
    roles: search.target_roles,
    industries: search.industries,
    workStyles: search.work_styles,
    locations: search.locations,
    // [DERIVED] Compensation floors are annual, in the career profile's currency.
    minCompensation: floorAmount && career.compensation_currency ? { amount: floorAmount, currency: career.compensation_currency } : null,
  }
  const flat = flattenResume(parsed.data)
  return {
    userId: search.user_id,
    searchId: search.id,
    prefs,
    resume: parsed.data,
    resumeText: career.resume_text ?? '',
    resumeCorpus: `${career.resume_text ?? ''}\n\n${flat}`,
    resumeForPrompt: flat,
    preferencesText: preferencesText(prefs),
  }
}

/** The job as the model and the verifier see it. */
export function jobDocument(job: {
  title: string
  company: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  description: string | null
}): string {
  const header = [`Title: ${job.title}`]
  if (job.company) header.push(`Company: ${job.company}`)
  if (job.location) header.push(`Location: ${job.location}`)
  if (job.salary_min !== null || job.salary_max !== null) {
    header.push(`Salary: ${job.salary_min ?? ''}–${job.salary_max ?? ''} ${job.salary_currency ?? ''}`.trim())
  }
  return `${header.join('\n')}\n\n${job.description ?? ''}`
}
