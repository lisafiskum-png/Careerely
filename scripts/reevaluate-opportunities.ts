// One-off remediation: re-evaluate already prepared opportunities with the
// current evidence validator and regenerate their application packages in place.
//
// Touches only the opportunities named. No search run, no queue task, no other
// opportunity is evaluated or prepared (other opportunities may change rank if
// a re-evaluated score changes, as in any scan). The package row is reused, so
// it keeps its quota period and the monthly allowance is not charged twice.
// Claude calls per opportunity: 1 evaluation + 1–2 package generations.
//
// Dry run (default; reads only, no Claude calls):
//   npm run remediate:reevaluate -- <opportunity-id>...
// Apply:
//   npm run remediate:reevaluate -- <opportunity-id>... --apply
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/admin'
import { loadSearchContext } from '../lib/engine/context'
import { failPackage, generatePackage } from '../lib/engine/prepare'
import { evaluateCandidate, JOB_COLUMNS, rerankUser, writeEvaluation, type JobRow } from '../lib/engine/scan'
import { SHORTLIST_MIN_SCORE } from '../lib/engine/scoring'

export type ReevaluationReport = {
  opportunityId: string
  outcome: 'dry_run' | 'regenerated' | 'discarded' | 'generation_failed' | 'skipped'
  detail: string
  oldScore: number | null
  newScore: number | null
  evidenceBefore: number
  evidenceAfter: number | null
  preparationsUsedBefore: number
  preparationsUsedAfter: number | null
}

const used = async (admin: SupabaseClient, userId: string) => {
  const { data, error } = await admin.rpc('preparations_used', { uid: userId })
  if (error) throw error
  return Number(data ?? 0)
}

const evidenceCount = async (admin: SupabaseClient, opportunityId: string) => {
  const { count, error } = await admin.from('evidence').select('id', { count: 'exact', head: true }).eq('opportunity_id', opportunityId)
  if (error) throw error
  return count ?? 0
}

export async function reevaluateOpportunity(admin: SupabaseClient, opportunityId: string, opts: { apply: boolean }): Promise<ReevaluationReport> {
  const { data: opp, error } = await admin
    .from('opportunities')
    .select(`id, user_id, search_id, state, match_score, dismissed_at, jobs(${JOB_COLUMNS}), application_packages(id, status)`)
    .eq('id', opportunityId)
    .maybeSingle()
  if (error) throw error

  const report: ReevaluationReport = {
    opportunityId,
    outcome: 'skipped',
    detail: '',
    oldScore: opp?.match_score === null || opp?.match_score === undefined ? null : Number(opp.match_score),
    newScore: null,
    evidenceBefore: opp ? await evidenceCount(admin, opportunityId) : 0,
    evidenceAfter: null,
    preparationsUsedBefore: opp ? await used(admin, opp.user_id) : 0,
    preparationsUsedAfter: null,
  }
  const pkg = (opp?.application_packages as unknown as { id: string; status: string } | { id: string; status: string }[] | null) ?? null
  const pkgRow = Array.isArray(pkg) ? pkg[0] : pkg
  if (!opp) return { ...report, detail: 'Opportunity not found.' }
  if (!opp.search_id) return { ...report, detail: 'Opportunity has no search.' }
  if (opp.dismissed_at) return { ...report, detail: 'Opportunity was dismissed by the user.' }
  // 'preparing' allows re-running after an interrupted run.
  if (!['ready', 'preparing'].includes(opp.state) || !pkgRow || !['ready', 'preparing'].includes(pkgRow.status)) {
    return { ...report, detail: `Not a prepared opportunity (state ${opp.state}, package ${pkgRow?.status ?? 'none'}).` }
  }
  if (!opts.apply) return { ...report, outcome: 'dry_run', detail: 'Would re-evaluate and regenerate the package (run with --apply).' }

  // Re-evaluate with the current validator.
  const job = opp.jobs as unknown as JobRow
  const ctx = await loadSearchContext(admin, opp.search_id)
  const result = await evaluateCandidate(job, ctx)
  report.newScore = result.matchScore

  if (result.matchScore === null || result.matchScore < SHORTLIST_MIN_SCORE) {
    // No longer shortlist-worthy on traceable evidence: discard the package
    // (releases its quota) and leave the opportunity for a decision.
    // fail_application_package only fails a package that is still being
    // prepared (the engine's guard), so move this finished package back to
    // preparing first and name it explicitly.
    const { error: opError } = await admin.from('opportunities').update({ state: 'preparing' }).eq('id', opportunityId)
    if (opError) throw opError
    const { error: pkgError } = await admin.from('application_packages').update({ status: 'preparing' }).eq('id', pkgRow.id)
    if (pkgError) throw pkgError
    await failPackage(admin, opportunityId, 'Discarded: re-evaluation with the current evidence rules no longer supports shortlisting.', pkgRow.id)
    report.outcome = 'discarded'
    report.detail =
      result.matchScore === null
        ? 'Not enough traceable evidence to score the role now (fit unknown). Package discarded; opportunity left Shortlisted with its old evidence for review.'
        : `Re-evaluated score ${result.matchScore} is below ${SHORTLIST_MIN_SCORE}. Package discarded; opportunity left Shortlisted with its old evidence for review.`
    report.evidenceAfter = await evidenceCount(admin, opportunityId)
    report.preparationsUsedAfter = await used(admin, opp.user_id)
    return report
  }

  // Replace the evidence and everything that points at it.
  const { error: delError } = await admin.from('evidence').delete().eq('opportunity_id', opportunityId)
  if (delError) throw delError
  await writeEvaluation(admin, opportunityId, opp.user_id, job, result)
  report.evidenceAfter = await evidenceCount(admin, opportunityId)

  // Reset the package in place (same row, same quota period) and regenerate.
  const { error: pkgError } = await admin
    .from('application_packages')
    .update({
      status: 'preparing',
      attempts: 0,
      resume_changes: [],
      tailored_resume: null,
      tailored_resume_text: null,
      has_changes: null,
      cover_letter_segments: [],
      cover_letter_text: null,
      resume_pdf_path: null,
      cover_letter_pdf_path: null,
      generation_model: null,
      completed_at: null,
      error: null,
    })
    .eq('id', pkgRow.id)
  if (pkgError) throw pkgError
  const { error: oppError } = await admin
    .from('opportunities')
    .update({ state: 'preparing', preparing_started_at: new Date().toISOString(), ready_at: null })
    .eq('id', opportunityId)
  if (oppError) throw oppError
  await rerankUser(admin, opp.user_id)

  try {
    await generatePackage(admin, opportunityId)
    report.outcome = 'regenerated'
    report.detail = 'Evidence re-verified and package regenerated.'
  } catch (err) {
    await failPackage(admin, opportunityId, err instanceof Error ? err.message : String(err))
    report.outcome = 'generation_failed'
    report.detail = `Package generation failed; package marked failed (quota released): ${err instanceof Error ? err.message : String(err)}`
  }
  report.preparationsUsedAfter = await used(admin, opp.user_id)
  return report
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const ids = args.filter(a => a !== '--apply')
  if (!ids.length || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
    console.error('Usage: scripts/reevaluate-opportunities.ts <opportunity-id>... [--apply]')
    process.exit(2)
  }
  const admin = createAdminClient()
  for (const id of ids) console.log(JSON.stringify(await reevaluateOpportunity(admin, id, { apply }), null, 2))
}

if (process.argv[1]?.endsWith('reevaluate-opportunities.ts')) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
