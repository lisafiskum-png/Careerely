import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hardFilter, locationMatches, preferredPlaces, relevance, type CandidateJob } from './filter'
import { jobDocument, loadSearchContext, type SearchContext } from './context'
import { evaluateJob } from './evaluate'
import { STAGE_NUMBER, type OpportunityPipelineStage, type RejectionReason } from './schema'
import { alignmentScore, compositeScore, rankOpportunities, MIN_SCORED_DIMENSIONS, SHORTLIST_MAX_PER_SCAN, SHORTLIST_MIN_SCORE, type KnownDimension } from './scoring'
import { goalEvidence, primaryEvidence, verifyEvaluation, type VerifiedEvaluation, type VerifiedEvidence } from './verify'

// One scan of one search, in three resumable phases:
//   start    → Stage 1 on eligible active postings; pick fresh candidates
//   evaluate → Stages 2–5 for a few candidates per invocation
//   finalize → threshold + ranking, then store opportunities + evidence
// Every evaluated posting ends in exactly one of:
//   shortlisted  → an opportunity
//   rejected     → a rejection row
//   not_selected → eligible but outside this scan's shortlist cap
//   unevaluable  → too little traceable evidence; fit is unknown, not low
// Continuous scanning must not repeatedly spend AI on unchanged candidates, so
// settled outcomes carry an inputs hash and cool down before reconsideration.

/** [DERIVED] Postings first seen within this many days are considered. */
export const CANDIDATE_MAX_AGE_DAYS = 45
/** Full AI evaluations per search per scan (cost control); the rest stay in the pool. */
export const EVALUATIONS_PER_SCAN = 20
export const EVALUATION_BATCH = 5
/** Eligible-but-not-selected roles may compete again after this cooldown. */
export const NOT_SELECTED_RECHECK_MS = 24 * 60 * 60_000
/** Transient AI failures cool down before another paid attempt. */
export const FAILED_EVALUATION_RECHECK_MS = 30 * 60_000

export type JobRow = CandidateJob & {
  description: string | null
  posted_at: string | null
  salary_min: number | null
}

export const JOB_COLUMNS = 'id, title, company, location, work_style, salary_min, salary_max, salary_currency, is_active, dedupe_key, description, posted_at'

/** Fingerprint of everything an evaluation sees: resume, search preferences, posting. */
export function evaluationInputsHash(ctx: Pick<SearchContext, 'resumeCorpus' | 'preferencesText'>, job: Parameters<typeof jobDocument>[0]): string {
  return createHash('sha256').update(ctx.resumeCorpus).update('\u0000').update(ctx.preferencesText).update('\u0000').update(jobDocument(job)).digest('hex')
}

async function logRejections(
  admin: SupabaseClient,
  rows: { user_id: string; job_id: string; search_id: string; run_id: string; stage: OpportunityPipelineStage; reason: RejectionReason; detail: string; details?: object }[],
) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(r => ({
      user_id: r.user_id,
      job_id: r.job_id,
      search_id: r.search_id,
      run_id: r.run_id,
      stage: STAGE_NUMBER[r.stage],
      reason_code: r.reason,
      detail: r.detail,
      details: r.details ?? {},
    }))
    const { error } = await admin.from('rejections').insert(chunk)
    if (error) throw error
  }
}

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, max = 20_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

type PreviousEvaluation = {
  job_id: string
  status: string
  inputs_hash: string | null
  evaluated_at: string | null
  created_at: string
}

/** Latest settled/failed evaluation for each job in this search. */
function latestEvaluations(rows: PreviousEvaluation[]): Map<string, PreviousEvaluation> {
  const latest = new Map<string, PreviousEvaluation>()
  for (const row of rows) {
    const old = latest.get(row.job_id)
    const rowAt = new Date(row.evaluated_at ?? row.created_at).getTime()
    const oldAt = old ? new Date(old.evaluated_at ?? old.created_at).getTime() : -Infinity
    if (!old || rowAt > oldAt) latest.set(row.job_id, row)
  }
  return latest
}

function shouldReevaluate(previous: PreviousEvaluation | undefined, hash: string, now: Date): boolean {
  if (!previous || previous.inputs_hash !== hash) return true
  if (previous.status === 'unevaluable') return false
  const at = new Date(previous.evaluated_at ?? previous.created_at).getTime()
  const age = now.getTime() - at
  if (previous.status === 'not_selected') return age >= NOT_SELECTED_RECHECK_MS
  if (previous.status === 'failed') return age >= FAILED_EVALUATION_RECHECK_MS
  return true
}

// ── Phase: start ────────────────────────────────────────────────────────────

export async function startScan(admin: SupabaseClient, searchId: string, now = new Date()): Promise<{ runId: string; pending: number } | null> {
  const ctx = await loadSearchContext(admin, searchId)
  const { data: access, error: accessError } = await admin.rpc('has_active_access', { uid: ctx.userId })
  if (accessError) throw accessError
  const { data: search, error: searchError } = await admin.from('searches').select('status').eq('id', searchId).single()
  if (searchError) throw searchError
  if (!access || search?.status !== 'active') return null

  const { data: run, error: runError } = await admin
    .from('search_runs')
    .insert({ user_id: ctx.userId, search_id: searchId, status: 'running' })
    .select('id')
    .single()
  if (runError) throw runError

  const since = new Date(now.getTime() - CANDIDATE_MAX_AGE_DAYS * 86_400_000).toISOString()
  const [pool, rejected, existing, previousRows] = await Promise.all([
    allRows<JobRow>((a, b) =>
      admin.from('jobs').select(JOB_COLUMNS).eq('is_active', true).gte('first_seen_at', since).order('first_seen_at', { ascending: false }).range(a, b),
    ),
    allRows<{ job_id: string }>((a, b) => admin.from('rejections').select('job_id').eq('search_id', searchId).range(a, b)),
    allRows<{ job_id: string; jobs: { dedupe_key: string | null } | null }>((a, b) =>
      admin.from('opportunities').select('job_id, jobs(dedupe_key)').eq('user_id', ctx.userId).range(a, b),
    ),
    allRows<PreviousEvaluation>((a, b) =>
      admin
        .from('candidate_evaluations')
        .select('job_id, status, inputs_hash, evaluated_at, created_at')
        .eq('search_id', searchId)
        .in('status', ['not_selected', 'unevaluable', 'failed'])
        .order('created_at', { ascending: false })
        .range(a, b),
    ),
  ])

  const done = new Set([...rejected.map(r => r.job_id), ...existing.map(o => o.job_id)])
  const seenDedupe = new Set(existing.map(o => o.jobs?.dedupe_key).filter((k): k is string => Boolean(k)))
  const previous = latestEvaluations(previousRows)
  const hashes = new Map<string, string>()
  const candidates = pool.filter(j => {
    if (done.has(j.id)) return false
    const hash = evaluationInputsHash(ctx, j)
    hashes.set(j.id, hash)
    return shouldReevaluate(previous.get(j.id), hash, now)
  })

  const rejections: Parameters<typeof logRejections>[1] = []
  const survivors: JobRow[] = []
  for (const job of candidates) {
    const result = hardFilter(job, ctx.prefs, seenDedupe, now)
    if (job.dedupe_key) seenDedupe.add(job.dedupe_key)
    if (result.passed) survivors.push(job)
    else
      rejections.push({
        user_id: ctx.userId,
        job_id: job.id,
        search_id: searchId,
        run_id: run.id,
        stage: 'stage_1_hard_filter',
        reason: 'failed_hard_filter',
        detail: result.failedCriteria.map(c => c.reason).join(' '),
        details: { failedCriteria: result.failedCriteria, evaluatedAt: result.evaluatedAt },
      })
  }
  await logRejections(admin, rejections)

  const picked = survivors
    .map(job => ({ job, score: relevance(job, ctx.prefs, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, EVALUATIONS_PER_SCAN)
  if (picked.length) {
    const { error } = await admin
      .from('candidate_evaluations')
      .insert(picked.map(p => ({ run_id: run.id, job_id: p.job.id, user_id: ctx.userId, search_id: searchId, inputs_hash: hashes.get(p.job.id) })))
    if (error) throw error
  }

  const { error: updateError } = await admin
    .from('search_runs')
    .update({
      jobs_reviewed: candidates.length,
      jobs_rejected: rejections.length,
      jobs_deferred: survivors.length - picked.length,
    })
    .eq('id', run.id)
  if (updateError) throw updateError

  return { runId: run.id, pending: picked.length }
}

// ── Phase: evaluate ─────────────────────────────────────────────────────────

export type CandidateResult = {
  evaluation: VerifiedEvaluation
  matchScore: number | null
  dimensions: KnownDimension[]
}

/** Deterministic location/compensation evidence (Stage 3 dimensions not judged by AI). */
export function factDimensions(job: JobRow, ctx: SearchContext): { evidence: VerifiedEvidence[]; dimensions: KnownDimension[] } {
  const evidence: VerifiedEvidence[] = []
  const dimensions: KnownDimension[] = []

  const places = preferredPlaces(ctx.prefs.locations)
  if (job.location && places.length && locationMatches(job.location, places)) {
    evidence.push({
      key: 'loc',
      signal_type: 'location_compatibility',
      source_type: 'job_description',
      source_text: job.location,
      claim: `The role is based in ${job.location}, one of your preferred locations`,
      outcome: 'confirmed',
      confidence: 0.9,
    })
  } else if (job.work_style === 'remote' && ctx.prefs.workStyles.includes('remote') && job.location && /remote/i.test(job.location)) {
    evidence.push({
      key: 'loc',
      signal_type: 'location_compatibility',
      source_type: 'job_description',
      source_text: job.location,
      claim: 'The role is remote, which you said you’re open to',
      outcome: 'confirmed',
      confidence: 0.85,
    })
  }
  if (evidence.length) dimensions.push({ dimension: 'location_fit', score: 100, evidenceRecordIds: ['loc'] })

  const floor = ctx.prefs.minCompensation
  if (floor && job.salary_max !== null && job.salary_currency?.toUpperCase() === floor.currency.toUpperCase() && job.salary_max >= floor.amount) {
    const line = `Salary: ${job.salary_min ?? ''}–${job.salary_max ?? ''} ${job.salary_currency ?? ''}`.trim()
    evidence.push({
      key: 'comp',
      signal_type: 'compensation_compatibility',
      source_type: 'job_description',
      source_text: line,
      claim: `The posted salary range reaches your minimum of ${floor.amount} ${floor.currency}`,
      outcome: 'confirmed',
      confidence: 0.9,
    })
    dimensions.push({ dimension: 'compensation_fit', score: 100, evidenceRecordIds: ['comp'] })
  }
  return { evidence, dimensions }
}

export async function evaluateCandidate(job: JobRow, ctx: SearchContext): Promise<CandidateResult> {
  const doc = jobDocument(job)
  const sources = {
    resume: ctx.resumeCorpus,
    job: doc,
    preferences: ctx.preferencesText,
    targetRoles: ctx.prefs.roles,
    jobTitle: job.title,
  }
  const raw = await evaluateJob({ ...sources, resumeForPrompt: ctx.resumeForPrompt })
  const evaluation = verifyEvaluation(raw, sources)

  const facts = factDimensions(job, ctx)
  evaluation.evidence.push(...facts.evidence)
  if (evaluation.goal.matchedTargetRole) {
    const goal = goalEvidence(evaluation.goal.matchedTargetRole, job.title)
    evaluation.evidence.push(goal)
    evaluation.goal.evidenceKeys = ['goal', ...evaluation.goal.evidenceKeys]
  }

  const dimensions: KnownDimension[] = [
    ...evaluation.dimensions.map(d => ({ dimension: d.dimension, score: d.score, evidenceRecordIds: d.evidenceKeys })),
    ...facts.dimensions,
  ]
  return { evaluation, matchScore: compositeScore(dimensions).matchScore, dimensions }
}

export async function evaluateBatch(admin: SupabaseClient, runId: string, batch = EVALUATION_BATCH): Promise<{ remaining: number }> {
  const { data: run, error } = await admin.from('search_runs').select('search_id').eq('id', runId).single()
  if (error) throw error
  const ctx = await loadSearchContext(admin, run.search_id)

  const { data: pending, error: pendingError } = await admin
    .from('candidate_evaluations')
    .select(`job_id, jobs(${JOB_COLUMNS})`)
    .eq('run_id', runId)
    .eq('status', 'pending')
    .limit(batch)
  if (pendingError) throw pendingError

  const outcomes = await Promise.allSettled(
    (pending ?? []).map(async row => {
      const job = row.jobs as unknown as JobRow
      let values: Record<string, unknown>
      try {
        const result = await evaluateCandidate(job, ctx)
        values = { status: 'evaluated', result, evaluated_at: new Date().toISOString() }
      } catch (err) {
        values = { status: 'failed', error: err instanceof Error ? err.message : String(err), evaluated_at: new Date().toISOString() }
      }
      const { error: saveError } = await admin.from('candidate_evaluations').update(values).eq('run_id', runId).eq('job_id', row.job_id)
      if (saveError) throw saveError
    }),
  )
  const saveErrors = outcomes.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (saveErrors.length) throw new AggregateError(saveErrors, 'Candidate evaluation persistence failed')

  const { count, error: countError } = await admin
    .from('candidate_evaluations')
    .select('job_id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('status', 'pending')
  if (countError) throw countError
  return { remaining: count ?? 0 }
}

// ── Phase: finalize ─────────────────────────────────────────────────────────

const aiJudgedWithEvidence = (dims: KnownDimension[]) =>
  dims.filter(d => d.evidenceRecordIds.length > 0 && d.dimension !== 'location_fit' && d.dimension !== 'compensation_fit').length

export async function finalizeRun(admin: SupabaseClient, runId: string): Promise<{ userId: string; shortlisted: string[] }> {
  const { data: run, error } = await admin.from('search_runs').select('id, user_id, search_id, jobs_rejected, status, new_opportunity_ids').eq('id', runId).single()
  if (error) throw error
  // A follow-up enqueue can fail after finalization committed. Replaying that
  // queue task must preserve the completed run's counters and opportunity ids.
  if (run.status === 'succeeded') return { userId: run.user_id, shortlisted: run.new_opportunity_ids ?? [] }

  const { data: rows, error: rowsError } = await admin
    .from('candidate_evaluations')
    .select(`job_id, status, result, jobs(${JOB_COLUMNS})`)
    .eq('run_id', runId)
  if (rowsError) throw rowsError

  const base = { user_id: run.user_id, search_id: run.search_id, run_id: run.id }
  const rejections: Parameters<typeof logRejections>[1] = []
  const passing: { job: JobRow; result: CandidateResult; matchScore: number }[] = []
  const outcomes: { job_id: string; status: 'not_selected' | 'unevaluable'; reason: string }[] = []

  for (const row of rows ?? []) {
    if (row.status !== 'evaluated' || !row.result) continue
    const job = row.jobs as unknown as JobRow
    const result = row.result as CandidateResult
    if (result.matchScore === null) {
      outcomes.push({
        job_id: job.id,
        status: 'unevaluable',
        reason: `Not enough traceable evidence to score this role: ${aiJudgedWithEvidence(result.dimensions)} of the ${MIN_SCORED_DIMENSIONS} required AI-judged fit dimensions had verified evidence. Fit is unknown, not low.`,
      })
    } else if (result.matchScore < SHORTLIST_MIN_SCORE) {
      rejections.push({
        ...base,
        job_id: job.id,
        stage: 'stage_3_scoring',
        reason: 'score_below_threshold',
        detail: `Match score ${result.matchScore} is below the shortlist threshold of ${SHORTLIST_MIN_SCORE}.`,
        details: { matchScore: result.matchScore },
      })
    } else {
      passing.push({ job, result, matchScore: result.matchScore })
    }
  }

  const ranked = rankOpportunities(
    passing.map(p => ({
      ...p,
      id: p.job.id,
      goalAligned: p.result.evaluation.goal.aligned,
      industryMatch: p.result.evaluation.goal.industryMatch,
      postedAt: p.job.posted_at,
    })),
  )
  const shortlist = ranked.slice(0, SHORTLIST_MAX_PER_SCAN)
  for (const r of ranked.slice(SHORTLIST_MAX_PER_SCAN)) {
    outcomes.push({
      job_id: r.job.id,
      status: 'not_selected',
      reason: `Eligible: match score ${r.matchScore} meets the shortlist threshold of ${SHORTLIST_MIN_SCORE}, but ranked ${r.finalRank} in this scan, outside the top ${SHORTLIST_MAX_PER_SCAN}. It can compete again after the recheck cooldown or sooner if its inputs change.`,
    })
  }

  const created: string[] = []
  for (const item of shortlist) {
    const id = await storeOpportunity(admin, run, item.job, item.result)
    if (id) created.push(id)
  }
  await logRejections(admin, rejections)
  const evaluatedAt = new Date().toISOString()
  for (const o of outcomes) {
    const { error: e } = await admin
      .from('candidate_evaluations')
      .update({ status: o.status, reason: o.reason, evaluated_at: evaluatedAt })
      .eq('run_id', runId)
      .eq('job_id', o.job_id)
    if (e) throw e
  }
  await rerankUser(admin, run.user_id)

  await admin
    .from('search_runs')
    .update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      jobs_shortlisted: created.length,
      jobs_rejected: (run.jobs_rejected ?? 0) + rejections.length,
      jobs_not_selected: outcomes.filter(o => o.status === 'not_selected').length,
      jobs_unevaluable: outcomes.filter(o => o.status === 'unevaluable').length,
      new_opportunity_ids: created,
    })
    .eq('id', runId)
  await admin.from('searches').update({ last_scan_at: new Date().toISOString() }).eq('id', run.search_id)

  // Keep only the latest settled outcome per search/job. Evaluated rows that
  // became opportunities/rejections are no longer needed; retained cooldown
  // outcomes carry the latest inputs hash and timestamp.
  await admin.from('candidate_evaluations').delete().eq('run_id', runId).eq('status', 'evaluated')
  const settled = (rows ?? []).filter(r => r.status === 'evaluated').map(r => r.job_id as string)
  for (let i = 0; i < settled.length; i += 200) {
    await admin
      .from('candidate_evaluations')
      .delete()
      .eq('search_id', run.search_id)
      .neq('run_id', runId)
      .in('job_id', settled.slice(i, i + 200))
  }
  if (created.length) {
    await admin.from('activity').insert({ user_id: run.user_id, kind: 'opportunities_shortlisted', payload: { count: created.length, run_id: runId } })
  }
  return { userId: run.user_id, shortlisted: created }
}

/** Stage 5 — stores the opportunity and its evidence records, mapping evidence keys to ids. */
async function storeOpportunity(
  admin: SupabaseClient,
  run: { id: string; user_id: string; search_id: string },
  job: JobRow,
  result: CandidateResult,
): Promise<string | null> {
  const { evaluation } = result
  const { data: opp, error } = await admin
    .from('opportunities')
    .upsert(
      {
        user_id: run.user_id,
        job_id: job.id,
        search_id: run.search_id,
        run_id: run.id,
        state: 'shortlisted',
        match_score: result.matchScore,
        goal_aligned: evaluation.goal.aligned,
        industry_match: evaluation.goal.industryMatch,
        alignment_score: alignmentScore(evaluation.goal.aligned, evaluation.goal.industryMatch),
        matched_target_role: evaluation.goal.matchedTargetRole,
      },
      { onConflict: 'user_id,job_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!opp) return null
  await writeEvaluation(admin, opp.id, run.user_id, job, result)
  return opp.id
}

/**
 * Stores an opportunity's evaluation: its evidence records, then the scores,
 * requirement evaluations, goal alignment and reasoning that point at them.
 * Expects the opportunity to have no evidence yet.
 */
export async function writeEvaluation(admin: SupabaseClient, opportunityId: string, userId: string, job: Pick<JobRow, 'id'>, result: CandidateResult): Promise<void> {
  const { evaluation } = result
  const { data: stored, error: evError } = await admin
    .from('evidence')
    .insert(
      evaluation.evidence.map(e => ({
        user_id: userId,
        opportunity_id: opportunityId,
        job_id: job.id,
        signal_type: e.signal_type,
        source_type: e.source_type,
        source_text: e.source_text,
        claim: e.claim,
        outcome: e.outcome,
        confidence: e.confidence,
        details: { key: e.key },
      })),
    )
    .select('id, details')
  if (evError) throw evError
  const idFor = new Map((stored ?? []).map(r => [(r.details as { key: string }).key, r.id as string]))
  const ids = (keys: string[]) => keys.map(k => idFor.get(k)).filter((v): v is string => Boolean(v))

  const dimensions = compositeScore(result.dimensions).dimensions.map(d => ({ ...d, evidenceRecordIds: ids(d.evidenceRecordIds) }))
  const primary = primaryEvidence(evaluation.evidence).map(e => idFor.get(e.key)).filter((v): v is string => Boolean(v))

  const { error: updError } = await admin
    .from('opportunities')
    .update({
      match_score: result.matchScore,
      goal_aligned: evaluation.goal.aligned,
      industry_match: evaluation.goal.industryMatch,
      alignment_score: alignmentScore(evaluation.goal.aligned, evaluation.goal.industryMatch),
      matched_target_role: evaluation.goal.matchedTargetRole,
      scores: { matchScore: result.matchScore, dimensions, scoredAt: new Date().toISOString() },
      requirement_evaluations: evaluation.requirements.map(r => ({
        requirementText: r.requirementText,
        outcome: r.outcome,
        evidenceRecordIds: ids(r.evidenceKeys),
        confidence: r.confidence,
        notes: r.notes,
      })),
      ranking_factors: [
        { factor: 'goal_aligned', value: evaluation.goal.aligned },
        { factor: 'industry_match', value: evaluation.goal.industryMatch },
        { factor: 'match_score', value: result.matchScore },
      ],
      reasoning: evaluation.reasoning.text || null,
      reasoning_evidence_ids: ids(evaluation.reasoning.evidenceKeys),
      primary_evidence_ids: primary,
      goal_evidence_ids: ids(evaluation.goal.evidenceKeys),
      goal_reasoning: evaluation.goal.matchedTargetRole
        ? `Matches your target role “${evaluation.goal.matchedTargetRole}”.`
        : 'Doesn’t match one of your target roles, so it ranks below roles that do.',
    })
    .eq('id', opportunityId)
  if (updError) throw updError
}

/** Stage 4 across all of a user's live opportunities. Rank 1 is My Pick. */
export async function rerankUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: live, error } = await admin
    .from('opportunities')
    .select('id, goal_aligned, industry_match, match_score, jobs(posted_at)')
    .eq('user_id', userId)
    .is('dismissed_at', null)
  if (error) throw error

  const ranked = rankOpportunities(
    (live ?? []).map(o => ({
      id: o.id as string,
      goalAligned: Boolean(o.goal_aligned),
      industryMatch: Boolean(o.industry_match),
      matchScore: Number(o.match_score ?? 0),
      postedAt: (o.jobs as unknown as { posted_at: string | null } | null)?.posted_at ?? null,
    })),
  )
  await admin.from('opportunities').update({ is_my_pick: false }).eq('user_id', userId).eq('is_my_pick', true)
  for (const r of ranked) {
    const { error: e } = await admin
      .from('opportunities')
      .update({ rank: r.finalRank, is_my_pick: r.finalRank === 1 })
      .eq('id', r.id)
    if (e) throw e
  }
}
