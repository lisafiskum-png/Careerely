import 'server-only'
import { createClient } from './supabase/server'
import { primaryEvidence, type DashPick } from './dashboard'
import { jobMeta } from './display'
import type { WorkStyle } from './engine/schema'

// Applications page (Master Brief §11): applications Careerely prepared that
// wait for the user ("Ready to apply"), then the ones submitted, with manual
// status tracking. Read through the user's session; counts come from stored
// rows only.

export type AppStage = 'applied' | 'interview' | 'offer'
export type AppOutcome = 'declined' | 'withdrawn'

export type ApplicationItem = {
  id: string
  opportunityId: string
  title: string
  company: string
  meta: string[]
  location: string | null
  matchScore: number | null
  evidence: DashPick['evidence']
  hasChanges: boolean | null
  /** The posting is no longer listed on the company's board. */
  postingClosed: boolean
  status: 'ready_to_apply' | AppStage
  outcome: AppOutcome | null
  appliedAt: string | null
  statusUpdatedAt: string
  rank: number | null
}

export type ApplicationsData = {
  ready: ApplicationItem[]
  submitted: ApplicationItem[]
  /** Master Brief §11: "N prepared · N applied · N interviews". */
  counts: { prepared: number; applied: number; interviews: number }
}

type Row = {
  id: string
  status: ApplicationItem['status']
  outcome: AppOutcome | null
  applied_at: string | null
  status_updated_at: string
  created_at: string
  opportunity_id: string | null
  opportunities: {
    id: string
    rank: number | null
    match_score: number | string | null
    primary_evidence_ids: string[] | null
    jobs: { is_active: boolean | null; title: string; company: string | null; location: string | null; work_style: WorkStyle | null; salary_min: number | null; salary_max: number | null; salary_currency: string | null } | null
  } | null
  application_packages: { status: string; has_changes: boolean | null } | null
}

// Display order only: Offer, Interview, Applied.
const STAGE_ORDER: Record<AppStage, number> = { offer: 0, interview: 1, applied: 2 }

export async function loadApplications(): Promise<ApplicationsData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, status, outcome, applied_at, status_updated_at, created_at, opportunity_id, opportunities(id, rank, match_score, primary_evidence_ids, jobs(is_active, title, company, location, work_style, salary_min, salary_max, salary_currency)), application_packages(status, has_changes)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = ((data ?? []) as unknown as Row[]).filter(r => r.opportunities?.jobs)

  const evidence = await primaryEvidence(supabase, new Map(rows.map(r => [r.id, r.opportunities!.primary_evidence_ids ?? []])))
  const items = rows.map((r): ApplicationItem => {
    const job = r.opportunities!.jobs!
    const meta = jobMeta(job)
    return {
      id: r.id,
      opportunityId: r.opportunities!.id,
      title: job.title,
      company: job.company ?? '',
      meta,
      location: meta[0] ?? null,
      matchScore: r.opportunities!.match_score === null ? null : Math.round(Number(r.opportunities!.match_score)),
      evidence: evidence.get(r.id) ?? [],
      hasChanges: r.application_packages?.has_changes ?? null,
      postingClosed: job.is_active === false,
      status: r.status,
      outcome: r.outcome,
      appliedAt: r.applied_at,
      statusUpdatedAt: r.status_updated_at,
      rank: r.opportunities!.rank,
    }
  })

  // Stored rank order; postings no longer listed last.
  const ready = items
    .filter(a => a.status === 'ready_to_apply' && !a.outcome)
    .sort((a, b) => Number(a.postingClosed) - Number(b.postingClosed) || (a.rank ?? Infinity) - (b.rank ?? Infinity))
  // Active stages first (Offer, Interview, Applied), then closed outcomes; within each group, most recent status update first.
  const submitted = items
    .filter(a => a.status !== 'ready_to_apply')
    .sort(
      (a, b) =>
        Number(Boolean(a.outcome)) - Number(Boolean(b.outcome)) ||
        (a.outcome ? 0 : STAGE_ORDER[a.status as AppStage] - STAGE_ORDER[b.status as AppStage]) ||
        b.statusUpdatedAt.localeCompare(a.statusUpdatedAt),
    )

  return {
    ready,
    submitted,
    counts: {
      prepared: items.length,
      applied: items.filter(a => a.appliedAt).length,
      interviews: items.filter(a => (a.status === 'interview' || a.status === 'offer') && !a.outcome).length,
    },
  }
}
