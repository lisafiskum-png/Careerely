import 'server-only'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { PLAN_LIMITS, PLANS, type AccessState } from './plans'
import { isWorkStyle, type WorkStyle } from './onboarding'
import type { Suggestions } from './resume/schema'
import { planChangeNotice } from './plan-status'

// Searches page (Master Brief §12): what Careerely is hunting for on the
// user's behalf. Read through the user's session; the engine queue, which
// users cannot read, is looked up with the service role filtered by the
// session's user id. Both numbers on a card come from the latest completed
// scan of that search (decision 2026-10-01): never summed, never live counts.

const RUNNING_RUN_MAX_AGE_MS = 6 * 3600_000

export type SearchScan =
  /** A scan of this search is running, or queued for a search scanned before. */
  | { state: 'scanning'; lastScanAt: string | null }
  /** Never completed a scan; its first scan is queued (a real task exists). */
  | { state: 'first' }
  /** Never completed a scan and nothing is queued (e.g. over the daily immediate-scan cap): the next nightly run scans it. */
  | { state: 'nightly' }
  | { state: 'idle'; lastScanAt: string }

export type SearchCard = {
  id: string
  name: string
  status: 'active' | 'paused'
  targetRoles: string[]
  industries: string[]
  locations: string[]
  workStyles: WorkStyle[]
  minCompensation: number | null
  compensationCurrency: string | null
  createdFromProfile: boolean
  /** Paused automatically when a lower plan took effect (decision 2026-10-02); cleared only on resume. */
  pausedByPlanChange: boolean
  /** From the latest completed scan of this search; null when it has never completed one. */
  latest: { reviewed: number; shortlisted: number; finishedAt: string } | null
  scan: SearchScan
}

export type ProfileDefaults = {
  targetRoles: string[]
  industries: string[]
  locations: string[]
  workStyles: WorkStyle[]
  suggestedRoles: string[]
  suggestedIndustries: string[]
  /** The Career Profile's minimum, only when it has both an amount and a currency. */
  compensation: { amount: number; currency: string } | null
}

export type SearchesData = {
  searches: SearchCard[]
  activeCount: number
  /** Null for read-only accounts (no active plan). limit null = unlimited. */
  plan: { name: string; limit: number | null } | null
  profile: ProfileDefaults
  /** Names for the plan-change notice: paused by a plan change since the user last dismissed it. */
  planChangeNotice: string[]
}

type SearchRow = {
  id: string
  name: string
  status: 'active' | 'paused'
  target_roles: string[]
  industries: string[]
  locations: string[]
  work_styles: string[]
  min_compensation: number | null
  compensation_currency: string | null
  created_from_profile: boolean
  paused_by_plan_change_at: string | null
  created_at: string
}

export async function loadSearches(userId: string, access: AccessState): Promise<SearchesData> {
  const supabase = await createClient()
  const [{ data: rows, error }, { data: career }, { data: profileRow }] = await Promise.all([
    supabase
      .from('searches')
      .select('id, name, status, target_roles, industries, locations, work_styles, min_compensation, compensation_currency, created_from_profile, paused_by_plan_change_at, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('career_profiles').select('target_roles, industries, locations, work_styles, suggestions, min_compensation, compensation_currency').maybeSingle(),
    supabase.from('profiles').select('plan_change_notice_dismissed_at').eq('id', userId).maybeSingle(),
  ])
  if (error) throw error
  const searches = (rows ?? []) as SearchRow[]
  const ids = searches.map(s => s.id)

  const [latestRuns, { data: running }, { data: tasks }] = await Promise.all([
    Promise.all(
      ids.map(id =>
        supabase
          .from('search_runs')
          .select('search_id, jobs_reviewed, jobs_shortlisted, finished_at')
          .eq('search_id', id)
          .eq('status', 'succeeded')
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ),
    ids.length
      ? supabase
          .from('search_runs')
          .select('search_id')
          .in('search_id', ids)
          .eq('status', 'running')
          .gte('started_at', new Date(Date.now() - RUNNING_RUN_MAX_AGE_MS).toISOString())
      : Promise.resolve({ data: [] as { search_id: string }[] }),
    ids.length
      ? createAdminClient()
          .from('engine_tasks')
          .select('search_id, status, run_after')
          .eq('user_id', userId)
          .eq('kind', 'scan_search')
          .in('status', ['queued', 'running'])
      : Promise.resolve({ data: [] as { search_id: string; status: string; run_after: string }[] }),
  ])

  const latest = new Map<string, SearchCard['latest']>()
  for (const r of latestRuns) {
    const run = r.data
    if (run?.finished_at) latest.set(run.search_id, { reviewed: Number(run.jobs_reviewed), shortlisted: Number(run.jobs_shortlisted), finishedAt: run.finished_at })
  }
  const inProgress = new Set((running ?? []).map(r => r.search_id))
  const queued = new Set<string>()
  const pending = new Set<string>()
  const now = Date.now()
  for (const t of tasks ?? []) {
    if (!t.search_id) continue
    pending.add(t.search_id)
    if (t.status === 'running') inProgress.add(t.search_id)
    else if (new Date(t.run_after).getTime() <= now) queued.add(t.search_id)
  }

  const cards: SearchCard[] = searches.map(s => {
    const last = latest.get(s.id) ?? null
    const scan: SearchScan = inProgress.has(s.id)
      ? { state: 'scanning', lastScanAt: last?.finishedAt ?? null }
      : !last
        ? pending.has(s.id)
          ? { state: 'first' }
          : { state: 'nightly' }
        : queued.has(s.id)
          ? { state: 'scanning', lastScanAt: last.finishedAt }
          : { state: 'idle', lastScanAt: last.finishedAt }
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      targetRoles: s.target_roles,
      industries: s.industries,
      locations: s.locations,
      workStyles: s.work_styles.filter(isWorkStyle),
      minCompensation: s.min_compensation,
      compensationCurrency: s.compensation_currency,
      createdFromProfile: s.created_from_profile,
      pausedByPlanChange: s.status === 'paused' && s.paused_by_plan_change_at !== null,
      latest: last,
      scan,
    }
  })
  // Active first, then paused; each in creation order.
  cards.sort((a, b) => Number(a.status === 'paused') - Number(b.status === 'paused'))

  const suggestions = (career?.suggestions ?? {}) as Partial<Suggestions>
  const planInfo = access.kind === 'active' ? PLANS.find(p => p.id === access.plan) : undefined
  return {
    planChangeNotice: planChangeNotice(searches, profileRow?.plan_change_notice_dismissed_at ?? null).map(s => s.name),
    searches: cards,
    activeCount: cards.filter(c => c.status === 'active').length,
    plan: access.kind === 'active' && planInfo ? { name: planInfo.name, limit: PLAN_LIMITS[access.plan].activeSearches } : null,
    profile: {
      targetRoles: career?.target_roles ?? [],
      industries: career?.industries ?? [],
      locations: career?.locations ?? [],
      workStyles: ((career?.work_styles ?? []) as string[]).filter(isWorkStyle),
      suggestedRoles: suggestions.roles ?? [],
      suggestedIndustries: suggestions.industries ?? [],
      compensation: career?.min_compensation && career.compensation_currency ? { amount: career.min_compensation, currency: career.compensation_currency } : null,
    },
  }
}
