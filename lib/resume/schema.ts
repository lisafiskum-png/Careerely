import { z } from 'zod'
import { cleanChips, MAX_INDUSTRIES, MAX_ROLES } from '../onboarding'

// Structured resume produced in onboarding Step 2 and corrected by the user.
// This is the candidate's profile, not the Opportunity Engine schema (Phase C),
// which will read from it. Unknown values are empty strings / empty lists, never
// invented.

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  current: z.boolean(),
  highlights: z.array(z.string()),
})

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string(),
})

export const ResumeSchema = z.object({
  full_name: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.string()),
  summary: z.string(),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  certifications: z.array(z.string()),
})

// Step 3 pre-fill ("Suggested from your resume. Edit if needed.") and the
// analysing sequence lines. Each must be grounded in the resume text.
export const SuggestionsSchema = z.object({
  roles: z.array(z.string()),
  industries: z.array(z.string()),
  highlights: z.array(z.string()),
})

export const ParseResultSchema = z.object({
  resume: ResumeSchema,
  suggestions: SuggestionsSchema,
})

export type Experience = z.infer<typeof ExperienceSchema>
export type Education = z.infer<typeof EducationSchema>
export type Resume = z.infer<typeof ResumeSchema>
export type Suggestions = z.infer<typeof SuggestionsSchema>
export type ParseResult = z.infer<typeof ParseResultSchema>

const MAX_TEXT = 2000
const MAX_ITEMS = 40

const clip = (v: string, max = MAX_TEXT) => v.trim().slice(0, max)
const clipList = (list: string[], maxItems = MAX_ITEMS, maxLen = 300) =>
  list.map(v => clip(v, maxLen)).filter(Boolean).slice(0, maxItems)

/** Trims and bounds a resume (from the model or from the review form). */
export function normalizeResume(resume: Resume): Resume {
  return {
    full_name: clip(resume.full_name, 200),
    headline: clip(resume.headline, 300),
    email: clip(resume.email, 200),
    phone: clip(resume.phone, 60),
    location: clip(resume.location, 200),
    links: clipList(resume.links, 10, 300),
    summary: clip(resume.summary, 4000),
    experience: resume.experience.slice(0, MAX_ITEMS).map(e => ({
      title: clip(e.title, 200),
      company: clip(e.company, 200),
      location: clip(e.location, 200),
      start: clip(e.start, 40),
      end: e.current ? '' : clip(e.end, 40),
      current: e.current,
      highlights: clipList(e.highlights, 20, 600),
    })),
    education: resume.education.slice(0, 20).map(e => ({
      institution: clip(e.institution, 200),
      degree: clip(e.degree, 200),
      field: clip(e.field, 200),
      start: clip(e.start, 40),
      end: clip(e.end, 40),
    })),
    skills: cleanChips(resume.skills, 60),
    languages: cleanChips(resume.languages, 20),
    certifications: clipList(resume.certifications, 30, 300),
  }
}

export function normalizeSuggestions(s: Suggestions): Suggestions {
  return {
    roles: cleanChips(s.roles, MAX_ROLES),
    industries: cleanChips(s.industries, MAX_INDUSTRIES),
    highlights: cleanChips(s.highlights, 3),
  }
}

export function emptyExperience(): Experience {
  return { title: '', company: '', location: '', start: '', end: '', current: false, highlights: [] }
}

export function emptyEducation(): Education {
  return { institution: '', degree: '', field: '', start: '', end: '' }
}
