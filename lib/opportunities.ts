import 'server-only'
import { createClient } from './supabase/server'
import { getLiveOpportunities, getScanStatus, primaryEvidence, type DashOpportunity, type DashPick, type ScanStatus } from './dashboard'

// Opportunities page: the full current list (same rules as the Dashboard:
// not dismissed, not applied, posting still listed; stored rank order), each
// with its two primary evidence points. Read through the user's session.

export type OpportunityListItem = DashOpportunity & { evidence: DashPick['evidence'] }

export type OpportunitiesData = {
  pick: (OpportunityListItem & { reasoning: string | null }) | null
  others: OpportunityListItem[]
  scan: ScanStatus
  reviewedInLatest: number | null
  /** Something was shortlisted before and is now dismissed or applied to. */
  handledSome: boolean
}

export async function loadOpportunities(userId: string): Promise<OpportunitiesData> {
  const supabase = await createClient()
  const [{ list, raw, anyDismissed, anyApplied }, scan] = await Promise.all([getLiveOpportunities(), getScanStatus(userId)])
  const evidence = await primaryEvidence(supabase, new Map(list.map(o => [o.id, raw.get(o.id)?.primary_evidence_ids ?? []])))
  const items = list.map(o => ({ ...o, evidence: evidence.get(o.id) ?? [] }))
  const [top, ...others] = items
  return {
    pick: top ? { ...top, reasoning: raw.get(top.id)?.reasoning?.trim() || null } : null,
    others,
    scan: { state: scan.state, lastScanAt: scan.lastScanAt },
    reviewedInLatest: scan.reviewedInLatest,
    handledSome: anyDismissed || anyApplied,
  }
}
