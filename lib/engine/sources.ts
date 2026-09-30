import type { WorkStyle } from './schema'
import type { AtsProvider, CompanyBoard } from './companies'
import { htmlToText, normalizeForMatch } from './text'

// Adapters for the public job-board APIs of Greenhouse, Lever and Ashby.
// Each returns postings normalised to the jobs table (JobPosting in the schema).

export type NormalizedJob = {
  source: AtsProvider
  source_job_id: string
  url: string
  title: string
  company: string
  company_slug: string
  location: string | null
  work_style: WorkStyle | null
  description: string
  requirements: string[]
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  posted_at: string | null
  dedupe_key: string
}

type Fetch = typeof fetch

const TIMEOUT_MS = 15_000

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchBoard(board: CompanyBoard, fetchImpl: Fetch = fetch): Promise<NormalizedJob[]> {
  switch (board.provider) {
    case 'greenhouse':
      return parseGreenhouse(
        board,
        await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true&pay_transparency=true`),
      )
    case 'lever':
      return parseLever(board, await getJson(fetchImpl, `https://api.lever.co/v0/postings/${board.slug}?mode=json`))
    case 'ashby':
      return parseAshby(
        board,
        await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`),
      )
  }
}

// ── Greenhouse ──────────────────────────────────────────────────────────────

type GreenhouseJob = {
  id: number | string
  title?: string
  absolute_url?: string
  location?: { name?: string }
  content?: string
  updated_at?: string
  first_published?: string
  pay_input_ranges?: { min_cents?: number; max_cents?: number; currency_type?: string }[]
}

export function parseGreenhouse(board: CompanyBoard, data: unknown): NormalizedJob[] {
  const jobs = ((data as { jobs?: GreenhouseJob[] })?.jobs ?? []).filter(j => j?.id && j.title && j.absolute_url)
  return jobs.map(j => {
    const location = j.location?.name?.trim() || null
    const description = htmlToText(j.content ?? '')
    const pay = j.pay_input_ranges?.[0]
    return finalize(board, {
      source_job_id: String(j.id),
      url: j.absolute_url!,
      title: j.title!.trim(),
      location,
      work_style: workStyleFromText(location),
      description,
      salary_min: pay?.min_cents ? Math.round(pay.min_cents / 100) : null,
      salary_max: pay?.max_cents ? Math.round(pay.max_cents / 100) : null,
      salary_currency: pay?.currency_type ?? null,
      posted_at: j.first_published ?? j.updated_at ?? null,
    })
  })
}

// ── Lever ───────────────────────────────────────────────────────────────────

type LeverJob = {
  id: string
  text?: string
  hostedUrl?: string
  categories?: { location?: string; allLocations?: string[]; commitment?: string }
  descriptionPlain?: string
  description?: string
  lists?: { text?: string; content?: string }[]
  additionalPlain?: string
  workplaceType?: string
  createdAt?: number
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string }
}

export function parseLever(board: CompanyBoard, data: unknown): NormalizedJob[] {
  const jobs = (Array.isArray(data) ? (data as LeverJob[]) : []).filter(j => j?.id && j.text && j.hostedUrl)
  return jobs.map(j => {
    const location = j.categories?.location?.trim() || j.categories?.allLocations?.join(', ') || null
    const sections = (j.lists ?? [])
      .map(l => `${l.text ?? ''}\n${htmlToText(l.content ?? '')}`.trim())
      .filter(Boolean)
    const description = [j.descriptionPlain?.trim() || htmlToText(j.description ?? ''), ...sections, j.additionalPlain?.trim() ?? '']
      .filter(Boolean)
      .join('\n\n')
    const yearly = j.salaryRange?.interval?.includes('year') ?? false
    return finalize(board, {
      source_job_id: j.id,
      url: j.hostedUrl!,
      title: j.text!.trim(),
      location,
      work_style: workStyleFromValue(j.workplaceType) ?? workStyleFromText(location),
      description,
      salary_min: yearly && j.salaryRange?.min ? j.salaryRange.min : null,
      salary_max: yearly && j.salaryRange?.max ? j.salaryRange.max : null,
      salary_currency: yearly ? (j.salaryRange?.currency ?? null) : null,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    })
  })
}

// ── Ashby ───────────────────────────────────────────────────────────────────

type AshbyJob = {
  id: string
  title?: string
  jobUrl?: string
  location?: string
  locationName?: string
  isRemote?: boolean
  workplaceType?: string
  descriptionPlain?: string
  descriptionHtml?: string
  publishedAt?: string
  isListed?: boolean
  compensation?: {
    summaryComponents?: { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }[]
  }
}

export function parseAshby(board: CompanyBoard, data: unknown): NormalizedJob[] {
  const payload = data as { jobs?: AshbyJob[]; jobPostings?: AshbyJob[] }
  const jobs = (payload?.jobs ?? payload?.jobPostings ?? []).filter(j => j?.id && j.title && j.jobUrl && j.isListed !== false)
  return jobs.map(j => {
    const location = (j.location ?? j.locationName ?? '').trim() || null
    const salary = j.compensation?.summaryComponents?.find(
      c => c.compensationType === 'Salary' && (c.interval ?? '').toUpperCase().includes('YEAR'),
    )
    return finalize(board, {
      source_job_id: j.id,
      url: j.jobUrl!,
      title: j.title!.trim(),
      location,
      work_style: workStyleFromValue(j.workplaceType) ?? (j.isRemote ? 'remote' : workStyleFromText(location)),
      description: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml ?? ''),
      salary_min: salary?.minValue ?? null,
      salary_max: salary?.maxValue ?? null,
      salary_currency: salary?.currencyCode ?? null,
      posted_at: j.publishedAt ?? null,
    })
  })
}

// ── Shared ──────────────────────────────────────────────────────────────────

function finalize(
  board: CompanyBoard,
  job: Omit<NormalizedJob, 'source' | 'company' | 'company_slug' | 'requirements' | 'dedupe_key'>,
): NormalizedJob {
  return {
    ...job,
    source: board.provider,
    company: board.company,
    company_slug: board.slug,
    requirements: extractRequirements(job.description),
    dedupe_key: dedupeKey(board.company, job.title, job.location),
  }
}

/** Same company + title + location = the same role, even across boards. */
export function dedupeKey(company: string, title: string, location: string | null): string {
  const norm = (s: string) => normalizeForMatch(s).replace(/[^a-z0-9]+/g, ' ').trim()
  return `${norm(company)}|${norm(title)}|${norm(location ?? '')}`
}

export function workStyleFromValue(value: string | undefined | null): WorkStyle | null {
  const v = (value ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (v === 'remote') return 'remote'
  if (v === 'hybrid') return 'hybrid'
  if (v === 'onsite' || v === 'inoffice' || v === 'office') return 'on_site'
  return null
}

/**
 * Work style from a location string when the board gives no explicit field.
 * "Remote - US" / "Remote (Europe)" → remote; mixed ("London or Remote") or
 * plain city names → unknown (null), never guessed.
 */
export function workStyleFromText(location: string | null): WorkStyle | null {
  const l = (location ?? '').toLowerCase()
  if (!l) return null
  if (/\bhybrid\b/.test(l)) return 'hybrid'
  if (/\bremote\b/.test(l) && !/\b(or|and)\b|;|\/|\|/.test(l)) return 'remote'
  return null
}

const REQUIREMENT_HEADINGS =
  /(requirement|qualification|what you('|’)ll (need|bring)|what we('|’)re looking for|who you are|about you|you (have|bring|are|might be)|you'?ll (have|need)|skills|experience|must have|nice to have|ideal candidate)/i

/**
 * Requirement lines as written in the posting ([DERIVED] JobPosting.requirements):
 * bullets under requirement-like headings, else all bullets. Kept verbatim so
 * every requirement shown to the user traces to the job description.
 */
export function extractRequirements(description: string): string[] {
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean)
  const isBullet = (l: string) => /^[•\-*–]\s+/.test(l)
  const strip = (l: string) => l.replace(/^[•\-*–]\s+/, '').trim()

  const underHeadings: string[] = []
  let inSection = false
  for (const line of lines) {
    if (!isBullet(line)) {
      inSection = REQUIREMENT_HEADINGS.test(line) && line.length < 120
      continue
    }
    if (inSection) underHeadings.push(strip(line))
  }
  const chosen = underHeadings.length ? underHeadings : lines.filter(isBullet).map(strip)
  return [...new Set(chosen.filter(l => l.length >= 8 && l.length <= 400))].slice(0, 25)
}
