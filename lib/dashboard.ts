import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { getAccessState, type AccessState, type SubscriptionState } from './plans'
import { jobMeta } from './display'
import type { WorkStyle } from './engine/schema'

// Data for the signed-in shell and the dashboard. Reads go through the user's
// own session (row level security), except the engine queue, which users
// cannot read: that lookup uses the service role, filtered by the session's
// user id. Every number shown comes from a stored value; nothing is summed
// across scans or estimated.

type JobFields = {
  is_active: boolean | null
  title: string
  company: string | null
  location: string | null
  work_style: WorkStyle | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
}

type OpportunityRow = {
  id: string
  rank: number | null
  state: 'shortlisted' | 'preparing' | 'ready'
  match_score: number | string | null
  dismissed_at: string | null
  reasoning: string | null
  primary_evidence_ids: string[] | null
  jobs: JobFields | null
  applications: { id: string; status: string; outcome: string | null }[] | { id: string; status: string; outcome: string | null } | null
  application_packages: { status: string; has_changes: boolean | null }[] | { status: string; has_changes: boolean | null } | null
}

export type DashOpportunity = {
  id: string
  rank: number | null
  state: 'shortlisted' | 'preparing' | 'ready'
  matchScore: number | null
  title: string
  company: string
  meta: string[]
  applicationId: string | null
  /** The prepared application is waiting for the user (Applications ready). */
  readyToApply: boolean
  hasChanges: boolean | null
}

export type DashPick = DashOpportunity & {
  evidence: { claim: string; outcome: 'confirmed' | 'inferred' }[]
  reasoning: string | null
}

export type DashActivity = {
  id: string
  icon: 'scan' | 'shortlist' | 'prepared' | 'applied' | 'closed'
  parts: (string | { strong: string })[]
  at: string
}

export type ScanStatus = { state: 'scanning' | 'idle' | 'never'; lastScanAt: string | null }

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** Applied / Interview / Offer or a closed outcome: the opportunity has moved on to Applications. */
function movedToApplications(app: { status: string; outcome: string | null } | null): boolean {
  return Boolean(app && (app.status !== 'ready_to_apply' || app.outcome))
}

/**
 * The user's live opportunities as Dashboard and Opportunities list them: not
 * dismissed, not yet applied to, posting still listed on its company board,
 * in the engine's rank order (the first is shown as My Pick). Nothing is
 * changed for the ones left out: an unlisted posting reappears if relisted.
 */
export const getLiveOpportunities = cache(async (): Promise<{ list: DashOpportunity[]; raw: Map<string, OpportunityRow>; anyDismissed: boolean; anyApplied: boolean }> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, rank, state, match_score, dismissed_at, reasoning, primary_evidence_ids, jobs(is_active, title, company, location, work_style, salary_min, salary_max, salary_currency), applications(id, status, outcome), application_packages(status, has_changes)',
    )
  if (error) throw error
  const rows = (data ?? []) as unknown as OpportunityRow[]
  const raw = new Map(rows.map(r => [r.id, r]))
  const list: DashOpportunity[] = []
  let anyApplied = false
  for (const r of rows) {
    if (r.dismissed_at || !r.jobs) continue
    const app = first(r.applications)
    if (movedToApplications(app)) {
      anyApplied = true
      continue
    }
    // Decision 2026-10-01: postings no longer listed on their board are hidden.
    if (r.jobs.is_active === false) continue
    const pkg = first(r.application_packages)
    list.push({
      id: r.id,
      rank: r.rank,
      state: r.state,
      matchScore: r.match_score === null ? null : Math.round(Number(r.match_score)),
      title: r.jobs.title,
      company: r.jobs.company ?? '',
      meta: jobMeta(r.jobs),
      applicationId: app?.id ?? null,
      readyToApply: r.state === 'ready' && app?.status === 'ready_to_apply' && pkg?.status === 'ready',
      hasChanges: pkg?.has_changes ?? null,
    })
  }
  list.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.matchScore ?? 0) - (a.matchScore ?? 0))
  return { list, raw, anyDismissed: rows.some(r => r.dismissed_at), anyApplied }
})

const RUNNING_RUN_MAX_AGE_MS = 6 * 3600_000

export const getScanStatus = cache(async (userId: string): Promise<ScanStatus & { reviewedInLatest: number | null }> => {
  const supabase = await createClient()
  const [{ data: latest }, { data: active }] = await Promise.all([
    supabase.from('search_runs').select('jobs_reviewed, finished_at').eq('status', 'succeeded').order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('searches').select('id').eq('status', 'active'),
  ])
  // "Scanning" only ever refers to searches that are active now: a leftover
  // or retrying task for a paused search never counts (decision 2026-10-01).
  const activeIds = (active ?? []).map(s => s.id as string)
  let scanning = false
  if (activeIds.length) {
    const { data: running } = await supabase
      .from('search_runs')
      .select('id')
      .in('search_id', activeIds)
      .eq('status', 'running')
      .gte('started_at', new Date(Date.now() - RUNNING_RUN_MAX_AGE_MS).toISOString())
      .limit(1)
    scanning = Boolean(running?.length)
    if (!scanning) {
      // A first scan waiting in the queue (e.g. while job boards are first synced).
      const { data: tasks } = await createAdminClient()
        .from('engine_tasks')
        .select('status, payload')
        .eq('user_id', userId)
        .eq('kind', 'scan_search')
        .in('search_id', activeIds)
        .in('status', ['queued', 'running'])
      scanning = (tasks ?? []).some(t => t.status === 'running' || (t.payload as { trigger?: string } | null)?.trigger === 'first')
    }
  }
  const lastScanAt = latest?.finished_at ?? null
  return {
    state: scanning ? 'scanning' : lastScanAt ? 'idle' : 'never',
    lastScanAt,
    reviewedInLatest: latest ? Number(latest.jobs_reviewed) : null,
  }
})

export const getAccount = cache(async (userId: string): Promise<{ firstName: string | null; lastName: string | null; access: AccessState }> => {
  const supabase = await createClient()
  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle(),
    supabase.from('subscriptions').select('plan, status, current_period_end').maybeSingle<SubscriptionState>(),
  ])
  return { firstName: profile?.first_name ?? null, lastName: profile?.last_name ?? null, access: getAccessState(subscription) }
})

/** The two primary evidence points (LOCKED: two strongest only) for each opportunity. */
export async function primaryEvidence(supabase: SupabaseClient, idsByOpportunity: Map<string, string[]>): Promise<Map<string, DashPick['evidence']>> {
  const all = [...new Set([...idsByOpportunity.values()].flat())]
  const out = new Map<string, DashPick['evidence']>()
  if (!all.length) return out
  const byId = new Map<string, { claim: string; outcome: string }>()
  for (let i = 0; i < all.length; i += 200) {
    const { data } = await supabase.from('evidence').select('id, claim, outcome').in('id', all.slice(i, i + 200))
    for (const e of data ?? []) byId.set(e.id as string, { claim: e.claim as string, outcome: e.outcome as string })
  }
  for (const [opp, ids] of idsByOpportunity) {
    out.set(
      opp,
      ids
        .map(id => byId.get(id))
        .filter((e): e is { claim: string; outcome: string } => Boolean(e) && (e!.outcome === 'confirmed' || e!.outcome === 'inferred'))
        .slice(0, 2)
        .map(e => ({ claim: e.claim, outcome: e.outcome as 'confirmed' | 'inferred' })),
    )
  }
  return out
}

async function pickEvidence(supabase: SupabaseClient, ids: string[]): Promise<DashPick['evidence']> {
  return (await primaryEvidence(supabase, new Map([['pick', ids]]))).get('pick') ?? []
}

async function recentActivity(supabase: SupabaseClient): Promise<DashActivity[]> {
  const [{ data: events }, { data: runs }] = await Promise.all([
    supabase
      .from('activity')
      .select('id, kind, payload, created_at, opportunities(jobs(title, company))')
      .in('kind', ['opportunities_shortlisted', 'application_prepared', 'application_applied', 'application_status_changed'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('search_runs')
      .select('id, jobs_reviewed, finished_at, searches(name)')
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(5),
  ])
  const items: DashActivity[] = []
  for (const e of events ?? []) {
    const job = first((e.opportunities as unknown as { jobs: { title: string; company: string | null } | null } | null)?.jobs ?? null)
    const at = e.created_at as string
    if (e.kind === 'opportunities_shortlisted') {
      const count = Number((e.payload as { count?: number })?.count ?? 0)
      if (count > 0) items.push({ id: e.id, icon: 'shortlist', parts: ['Shortlisted ', { strong: count.toLocaleString('en-US') }, count === 1 ? ' opportunity — ranked by fit and goal alignment' : ' opportunities — ranked by fit and goal alignment'], at })
    } else if (e.kind === 'application_prepared' && job) {
      items.push({ id: e.id, icon: 'prepared', parts: ['Prepared an application for ', { strong: job.company ?? job.title }, ` — ${job.title}`], at })
    } else if (e.kind === 'application_applied' && job) {
      items.push({ id: e.id, icon: 'applied', parts: ['You applied to ', { strong: job.company ?? job.title }, ` — ${job.title}`], at })
    } else if (e.kind === 'application_status_changed' && job) {
      const p = e.payload as { status?: string; outcome?: string | null }
      const label = { applied: 'Applied', interview: 'Interview', offer: 'Offer', declined: 'Declined', withdrawn: 'Withdrawn' }[p.outcome ?? p.status ?? '']
      if (label) {
        items.push(
          p.outcome
            ? { id: e.id, icon: 'closed', parts: ['Marked ', { strong: job.company ?? job.title }, ` — ${job.title} as ${label}`], at }
            : { id: e.id, icon: 'applied', parts: ['Moved ', { strong: job.company ?? job.title }, ` — ${job.title} to ${label}`], at },
        )
      }
    }
  }
  for (const r of runs ?? []) {
    if (!r.finished_at) continue
    const name = (first(r.searches as unknown as { name: string } | { name: string }[] | null))?.name
    items.push({
      id: `run-${r.id}`,
      icon: 'scan',
      parts: ['Reviewed ', { strong: Number(r.jobs_reviewed).toLocaleString('en-US') }, name ? ` postings for “${name}”` : ' postings'],
      at: r.finished_at as string,
    })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
}

/** Dashboard presentation limit (2026-10-01): My Pick plus up to 5 more. Not an engine cap. */
export const DASHBOARD_SHORTLIST_ROWS = 5

export type DashboardData = {
  pick: DashPick | null
  /** Preview of the shortlist after My Pick: at most DASHBOARD_SHORTLIST_ROWS, in stored rank order. */
  rows: DashOpportunity[]
  /** All live opportunities after My Pick, including those beyond the preview. */
  otherCount: number
  apps: DashOpportunity[]
  activity: DashActivity[]
  stats: { shortlisted: number; ready: number; reviewedInLatest: number | null; lastScanAt: string | null }
  scan: ScanStatus
  anyDismissed: boolean
}

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const supabase = await createClient()
  const [{ list, raw, anyDismissed }, scan, activity] = await Promise.all([getLiveOpportunities(), getScanStatus(userId), recentActivity(supabase)])
  const [top, ...others] = list
  const rows = others.slice(0, DASHBOARD_SHORTLIST_ROWS)
  let pick: DashPick | null = null
  if (top) {
    const r = raw.get(top.id)!
    pick = { ...top, reasoning: r.reasoning?.trim() || null, evidence: await pickEvidence(supabase, r.primary_evidence_ids ?? []) }
  }
  const apps = list.filter(o => o.readyToApply)
  return {
    pick,
    rows,
    otherCount: others.length,
    apps,
    activity,
    stats: { shortlisted: list.length, ready: apps.length, reviewedInLatest: scan.reviewedInLatest, lastScanAt: scan.lastScanAt },
    scan: { state: scan.state, lastScanAt: scan.lastScanAt },
    anyDismissed,
  }
}
