import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeKey, extractRequirements, isWebUrl, workStyleFromText } from './sources'

const DEFAULT_INTERVAL_MINUTES = 30
const MIN_INTERVAL_MINUTES = 10
const MAX_INTERVAL_MINUTES = 24 * 60
const REQUEST_TIMEOUT_MS = 15_000
const STALE_AFTER_DAYS = 7

export type GlobalDiscoveryResult = { fetched: number; upserted: number }

type SearchRow = {
  id: string
  status: string
  target_roles: string[]
  industries: string[]
  locations: string[]
}

type GoogleJob = {
  job_id?: unknown
  title?: unknown
  company_name?: unknown
  location?: unknown
  description?: unknown
  share_link?: unknown
  apply_options?: unknown
  detected_extensions?: unknown
}

function configuredIntervalMinutes(): number {
  const raw = Number(process.env.GLOBAL_DISCOVERY_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES)
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(raw)))
}

export function globalDiscoveryEnabled(): boolean {
  return process.env.GLOBAL_JOB_DISCOVERY_ENABLED === 'true' && Boolean(process.env.SERPAPI_KEY)
}

export function globalDiscoverySlot(now = new Date()): string {
  return String(Math.floor(now.getTime() / (configuredIntervalMinutes() * 60_000)))
}

function clean(value: unknown, max = 10_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function companySlug(company: string): string {
  return company
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'unknown-company'
}

function applyUrl(job: GoogleJob): string | null {
  if (Array.isArray(job.apply_options)) {
    for (const option of job.apply_options) {
      if (!option || typeof option !== 'object') continue
      const link = (option as { link?: unknown }).link
      if (isWebUrl(link)) return link.trim()
    }
  }
  return isWebUrl(job.share_link) ? job.share_link.trim() : null
}

/**
 * One request per active Careerely Search and discovery interval. The query is
 * deliberately compact: Google Jobs handles title/industry/location semantics,
 * while Careerely's own engine remains responsible for fit scoring.
 */
export function buildGlobalJobQuery(search: Pick<SearchRow, 'target_roles' | 'industries'>): string {
  const roles = (search.target_roles ?? []).map(x => x.trim()).filter(Boolean).slice(0, 3)
  const industries = (search.industries ?? []).map(x => x.trim()).filter(Boolean).slice(0, 2)
  const roleQuery = roles.length > 1 ? `(${roles.map(role => `"${role}"`).join(' OR ')})` : roles[0] ?? 'jobs'
  return [roleQuery, ...industries].filter(Boolean).join(' ')
}

export function parseGoogleJobs(payload: unknown): Array<{
  source: string
  source_job_id: string
  url: string
  title: string
  company: string
  company_slug: string
  location: string | null
  work_style: 'remote' | 'hybrid' | 'on_site' | null
  description: string
  requirements: string[]
  salary_min: null
  salary_max: null
  salary_currency: null
  posted_at: null
  dedupe_key: string
}> {
  if (!payload || typeof payload !== 'object') return []
  const results = (payload as { jobs_results?: unknown }).jobs_results
  if (!Array.isArray(results)) return []

  const out = []
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue
    const job = raw as GoogleJob
    const id = clean(job.job_id, 500)
    const title = clean(job.title, 500)
    const company = clean(job.company_name, 500)
    const url = applyUrl(job)
    if (!id || !title || !company || !url) continue

    const locationText = clean(job.location, 500) || null
    const description = clean(job.description, 50_000)
    const extensions = job.detected_extensions && typeof job.detected_extensions === 'object'
      ? (job.detected_extensions as { work_from_home?: unknown }).work_from_home
      : null
    const remote = extensions === true || /\bremote\b/i.test(String(extensions ?? ''))
    out.push({
      source: 'serpapi',
      source_job_id: id,
      url,
      title,
      company,
      company_slug: companySlug(company),
      location: locationText,
      work_style: remote ? ('remote' as const) : workStyleFromText(locationText),
      description,
      requirements: extractRequirements(description),
      // Google Jobs compensation is not normalized enough for Careerely's
      // annual minimum hard filter. Unknown is safer than guessing.
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: null,
      dedupe_key: dedupeKey(company, title, locationText),
    })
  }
  return out
}

export async function discoverGlobalJobs(admin: SupabaseClient, searchId: string, fetchImpl: typeof fetch = fetch): Promise<GlobalDiscoveryResult> {
  if (!globalDiscoveryEnabled()) return { fetched: 0, upserted: 0 }

  const { data, error } = await admin
    .from('searches')
    .select('id, status, target_roles, industries, locations')
    .eq('id', searchId)
    .maybeSingle<SearchRow>()
  if (error) throw error
  if (!data || data.status !== 'active') return { fetched: 0, upserted: 0 }

  const key = process.env.SERPAPI_KEY
  if (!key) return { fetched: 0, upserted: 0 }

  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_jobs')
  url.searchParams.set('q', buildGlobalJobQuery(data))
  const location = data.locations?.map(x => x.trim()).find(Boolean)
  if (location && !/^remote\b/i.test(location)) url.searchParams.set('location', location)
  url.searchParams.set('api_key', key)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error(`Global jobs provider returned HTTP ${response.status}`)
  const payload = await response.json().catch(() => null)
  const jobs = parseGoogleJobs(payload)
  const now = new Date().toISOString()

  for (let i = 0; i < jobs.length; i += 100) {
    const rows = jobs.slice(i, i + 100).map(job => ({ ...job, is_active: true, last_seen_at: now }))
    const { error: upsertError } = await admin.from('jobs').upsert(rows, { onConflict: 'source,source_job_id' })
    if (upsertError) throw upsertError
  }

  // Aggregated search results are not exhaustive snapshots, so never expire a
  // posting merely because it disappeared from one response. Only age out jobs
  // that have not appeared in any discovery result for a full week.
  await admin
    .from('jobs')
    .update({ is_active: false })
    .eq('source', 'serpapi')
    .eq('is_active', true)
    .lt('last_seen_at', new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString())

  return { fetched: jobs.length, upserted: jobs.length }
}
