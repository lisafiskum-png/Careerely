import type { HardFilterCriterion, HardFilterResult, WorkStyle } from './schema'
import { normalizeForMatch, tokens } from './text'

// Stage 1 — hard eligibility filtering (deterministic, no AI).
// Removes fundamentally mismatched roles before scoring. Only rejects on facts
// that are known on both sides: an unknown location, work style or salary is
// "unknown", never a reason to reject.

export type Preferences = {
  roles: string[]
  industries: string[]
  workStyles: WorkStyle[]
  locations: string[]
  minCompensation: { amount: number; currency: string } | null
}

export type CandidateJob = {
  id: string
  title: string
  company: string | null
  location: string | null
  work_style: WorkStyle | null
  salary_max: number | null
  salary_currency: string | null
  is_active: boolean
  dedupe_key: string | null
}

const WORK_STYLE_LABEL: Record<WorkStyle, string> = { remote: 'remote', hybrid: 'hybrid', on_site: 'on-site' }

// Role families for "role type fundamentally outside target categories".
// Multi-word phrases are checked before single words. A title that matches no
// family is unknown and passes.
const ROLE_FAMILIES: Record<string, string[]> = {
  sales_bd: [
    'business development', 'account executive', 'account manager', 'account management', 'partnerships', 'partnership',
    'partner manager', 'alliance', 'alliances', 'sales', 'bdr', 'sdr', 'go-to-market', 'gtm', 'commercial', 'revenue',
    'solutions engineer', 'solutions architect', 'sales engineer', 'pre-sales', 'presales', 'channel', 'business developer',
    'key account', 'enterprise account', 'strategic accounts', 'client partner',
  ],
  customer_success: ['customer success', 'customer support', 'support engineer', 'implementation', 'onboarding specialist', 'customer experience', 'account director'],
  engineering: [
    'software engineer', 'engineer', 'developer', 'sre', 'devops', 'engineering manager', 'architect', 'programmer', 'firmware',
    'infrastructure', 'platform engineer', 'qa', 'test engineer', 'security engineer', 'machine learning engineer',
  ],
  data: ['data scientist', 'data analyst', 'data engineer', 'analytics', 'business intelligence', 'machine learning', 'statistician'],
  design: ['designer', 'design lead', 'ux', 'ui', 'user research', 'researcher', 'illustrator', 'art director'],
  product: ['product manager', 'product owner', 'product lead', 'head of product', 'product director', 'vp product', 'group product'],
  marketing: ['marketing', 'brand', 'content', 'seo', 'communications', 'pr manager', 'social media', 'copywriter', 'demand generation', 'growth marketing', 'events'],
  finance: ['finance', 'financial analyst', 'accountant', 'accounting', 'controller', 'fp&a', 'treasury', 'tax', 'payroll', 'cfo', 'investor relations'],
  legal_compliance: ['legal', 'counsel', 'paralegal', 'compliance', 'aml', 'kyc', 'risk', 'regulatory', 'fraud', 'financial crime', 'privacy', 'audit'],
  people: ['recruiter', 'recruiting', 'talent', 'people partner', 'people operations', 'hr', 'human resources'],
  operations: ['operations', 'office manager', 'chief of staff', 'program manager', 'project manager', 'executive assistant', 'workplace', 'facilities', 'procurement', 'supply chain', 'logistics'],
}

// Families that are compatible with each other (e.g. solutions engineer is sales-side).
const COMPATIBLE: Record<string, string[]> = {
  sales_bd: ['customer_success'],
  customer_success: ['sales_bd'],
  engineering: ['data'],
  data: ['engineering'],
}

export function roleFamilies(title: string): Set<string> {
  const t = ` ${normalizeForMatch(title).replace(/[^a-z0-9&+ -]/g, ' ')} `
  const found = new Set<string>()
  for (const [family, phrases] of Object.entries(ROLE_FAMILIES)) {
    if (phrases.some(p => t.includes(` ${p} `) || t.includes(` ${p}s `))) found.add(family)
  }
  // "Sales Engineer"/"Solutions Engineer" are sales roles, not engineering roles.
  if (found.has('sales_bd') && /\b(solutions|sales|pre-?sales) (engineer|architect)\b/.test(t)) found.delete('engineering')
  return found
}

/** Place names from preferred locations ("Oslo, Norway" → "oslo"); remote entries excluded. */
export function preferredPlaces(locations: string[]): string[] {
  return locations
    .filter(l => !/\bremote\b/i.test(l))
    .map(l => normalizeForMatch(l.split(',')[0]))
    .filter(p => p.length >= 2)
}

export function locationMatches(jobLocation: string, places: string[]): boolean {
  const loc = ` ${normalizeForMatch(jobLocation).replace(/[^a-z0-9 ]/g, ' ')} `
  return places.some(p => loc.includes(` ${p.replace(/[^a-z0-9 ]/g, ' ').trim()} `))
}

export function hardFilter(job: CandidateJob, prefs: Preferences, seenDedupeKeys: Set<string>, now = new Date()): HardFilterResult {
  const failed: HardFilterCriterion[] = []

  if (!job.is_active) {
    failed.push({ criterion: 'expired_posting', reason: 'The posting is no longer listed on the company’s job board.' })
  }

  if (job.dedupe_key && seenDedupeKeys.has(job.dedupe_key)) {
    failed.push({ criterion: 'duplicate_posting', reason: 'The same role at the same company and location was already considered.' })
  }

  // Location: only when both sides are known.
  const wantsOnlyRemote = prefs.workStyles.length === 1 && prefs.workStyles[0] === 'remote'
  if (wantsOnlyRemote && (job.work_style === 'on_site' || job.work_style === 'hybrid')) {
    failed.push({
      criterion: 'location_mismatch',
      reason: `You’re looking for remote roles; this role is ${WORK_STYLE_LABEL[job.work_style]}${job.location ? ` in ${job.location}` : ''}.`,
    })
  } else {
    const places = preferredPlaces(prefs.locations)
    if (places.length && job.location && (job.work_style === 'on_site' || job.work_style === 'hybrid') && !locationMatches(job.location, places)) {
      failed.push({
        criterion: 'location_mismatch',
        reason: `This role is ${WORK_STYLE_LABEL[job.work_style]} in ${job.location}, outside your preferred locations.`,
      })
    }
  }

  // Compensation: both the floor and the posted maximum known, same currency.
  const floor = prefs.minCompensation
  if (
    floor &&
    job.salary_max !== null &&
    job.salary_currency &&
    job.salary_currency.toUpperCase() === floor.currency.toUpperCase() &&
    job.salary_max < floor.amount
  ) {
    failed.push({
      criterion: 'compensation_below_floor',
      reason: `The posted maximum (${job.salary_max} ${job.salary_currency}) is below your minimum (${floor.amount} ${floor.currency}).`,
    })
  }

  // Role category: both the job and at least one target role map to known families.
  const jobFamilies = roleFamilies(job.title)
  const targetFamilies = new Set(prefs.roles.flatMap(r => [...roleFamilies(r)]))
  if (jobFamilies.size && targetFamilies.size) {
    const compatible = [...jobFamilies].some(f => targetFamilies.has(f) || (COMPATIBLE[f] ?? []).some(c => targetFamilies.has(c)))
    if (!compatible) {
      failed.push({
        criterion: 'role_category_mismatch',
        reason: `“${job.title}” is outside the kinds of roles you’re targeting (${prefs.roles.join(', ')}).`,
      })
    }
  }

  return { jobPostingId: job.id, passed: failed.length === 0, failedCriteria: failed, evaluatedAt: now.toISOString() }
}

/**
 * Keyword relevance used to pick which Stage-1 survivors get a full AI
 * evaluation tonight (cost control). Not a score shown to users and not a
 * reason to reject: candidates that are not picked stay in the pool.
 */
export function relevance(job: CandidateJob & { description?: string | null; posted_at?: string | null }, prefs: Preferences, now = new Date()): number {
  const titleTokens = new Set(tokens(job.title))
  let best = 0
  for (const role of prefs.roles) {
    const rt = tokens(role)
    if (!rt.length) continue
    const overlap = rt.filter(t => titleTokens.has(t)).length / rt.length
    best = Math.max(best, overlap)
  }
  let score = best * 60
  const jobFamilies = roleFamilies(job.title)
  if (prefs.roles.some(r => [...roleFamilies(r)].some(f => jobFamilies.has(f)))) score += 20

  const text = normalizeForMatch(`${job.company ?? ''} ${job.description ?? ''}`)
  const industryHits = prefs.industries.filter(i => tokens(i).some(t => t.length > 2 && text.includes(t))).length
  score += Math.min(industryHits, 3) * 4

  const places = preferredPlaces(prefs.locations)
  if (job.work_style === 'remote' && prefs.workStyles.includes('remote')) score += 6
  else if (job.location && places.length && locationMatches(job.location, places)) score += 6

  if (job.posted_at) {
    const days = (now.getTime() - new Date(job.posted_at).getTime()) / 86_400_000
    if (days >= 0 && days <= 14) score += 2
  }
  return score
}
