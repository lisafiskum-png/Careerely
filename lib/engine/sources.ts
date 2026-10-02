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

/** Only http(s) posting links are kept: they are opened from the app. */
export function isWebUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url.trim())
}

/**
 * Why a board fetch failed (D8). Stored in the task's last_error as
 * "<provider>/<slug>: HTTP <status> (<kind>)", never with response bodies.
 *   not_found     404 / 410: the board doesn't exist on this provider
 *                 (wrong or outdated slug, company moved ATS, board removed).
 *                 Permanent: not retried, and skipped until rechecked.
 *   rejected      other 4xx (400, 401, 403, 422…): not retried today.
 *   malformed     2xx but not the provider's documented JSON shape: not
 *                 retried today (and never treated as "no jobs").
 *   rate_limited  429, provider_error 408 / 5xx, timeout, network: temporary,
 *                 retried with backoff.
 */
export type SourceFailureKind = 'not_found' | 'rejected' | 'malformed' | 'rate_limited' | 'provider_error' | 'timeout' | 'network'

export class SourceError extends Error {
  constructor(
    readonly provider: AtsProvider,
    readonly slug: string,
    readonly kind: SourceFailureKind,
    readonly status: number | null,
  ) {
    super(`${provider}/${slug}: ${status !== null ? `HTTP ${status} ` : ''}(${kind})`)
    this.name = 'SourceError'
  }
  /** The board itself is missing: don't retry, skip it until it is rechecked. */
  get permanent(): boolean {
    return this.kind === 'not_found'
  }
  /** Worth retrying later today. */
  get retriable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'provider_error' || this.kind === 'timeout' || this.kind === 'network'
  }
}

export function classifyStatus(status: number): SourceFailureKind {
  if (status === 404 || status === 410) return 'not_found'
  if (status === 429) return 'rate_limited'
  if (status === 408 || status >= 500) return 'provider_error'
  return 'rejected'
}

async function getJson(fetchImpl: Fetch, board: CompanyBoard, url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
  } catch {
    clearTimeout(timer)
    throw new SourceError(board.provider, board.slug, controller.signal.aborted ? 'timeout' : 'network', null)
  }
  try {
    if (!res.ok) throw new SourceError(board.provider, board.slug, classifyStatus(res.status), res.status)
    try {
      return await res.json()
    } catch {
      if (controller.signal.aborted) throw new SourceError(board.provider, board.slug, 'timeout', res.status)
      throw new SourceError(board.provider, board.slug, 'malformed', res.status)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** The documented response shape for each provider; anything else is malformed, never "no jobs". */
function hasExpectedShape(provider: AtsProvider, data: unknown): boolean {
  if (provider === 'lever') return Array.isArray(data)
  if (!data || typeof data !== 'object') return false
  const d = data as { jobs?: unknown; jobPostings?: unknown }
  return provider === 'greenhouse' ? Array.isArray(d.jobs) : Array.isArray(d.jobs) || Array.isArray(d.jobPostings)
}

export function boardUrl(board: CompanyBoard): string {
  switch (board.provider) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true&pay_transparency=true`
    case 'lever':
      return `https://api.lever.co/v0/postings/${board.slug}?mode=json`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`
  }
}

export async function fetchBoard(board: CompanyBoard, fetchImpl: Fetch = fetch): Promise<NormalizedJob[]> {
  const data = await getJson(fetchImpl, board, boardUrl(board))
  if (!hasExpectedShape(board.provider, data)) throw new SourceError(board.provider, board.slug, 'malformed', 200)
  switch (board.provider) {
    case 'greenhouse':
      return parseGreenhouse(board, data)
    case 'lever':
      return parseLever(board, data)
    case 'ashby':
      return parseAshby(board, data)
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
  const jobs = ((data as { jobs?: GreenhouseJob[] })?.jobs ?? []).filter(j => j?.id && j.title && isWebUrl(j.absolute_url))
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
  const jobs = (Array.isArray(data) ? (data as LeverJob[]) : []).filter(j => j?.id && j.text && isWebUrl(j.hostedUrl))
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
  const jobs = (payload?.jobs ?? payload?.jobPostings ?? []).filter(j => j?.id && j.title && isWebUrl(j.jobUrl) && j.isListed !== false)
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
