import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { CLAUDE_MODEL, getAnthropic } from '../ai'
import { NIGHTLY_AUTO_PREP } from '../plans'
import { jobDocument, loadSearchContext, type SearchContext } from './context'
import {
  COVER_LETTER_SEGMENT_TYPES,
  RESUME_CHANGE_TYPES,
  RESUME_SECTIONS,
  type CoverLetterSegment,
  type PreparationDecision,
  type ResumeChange,
} from './schema'
import { containsQuote, normalizeForMatch, unsupportedNumbers } from './text'

// ── Stage 6 — preparation decision ─────────────────────────────────────────

/**
 * Prepares the top-ranked shortlisted opportunities: at most NIGHTLY_AUTO_PREP
 * per run (LOCKED: top 2, all tiers) and never beyond the monthly allowance
 * (automatic preparation counts toward it). The reservation happens in the
 * database so concurrent workers can't overspend. Every considered
 * opportunity gets a PreparationDecision; none is rejected — unselected ones
 * stay shortlisted.
 */
export async function decidePreparation(admin: SupabaseClient, userId: string, now = new Date()): Promise<string[]> {
  const { data: shortlisted, error } = await admin
    .from('opportunities')
    .select('id, job_id, rank')
    .eq('user_id', userId)
    .eq('state', 'shortlisted')
    .is('dismissed_at', null)
    .order('rank', { ascending: true })
  if (error) throw error
  const ordered = shortlisted ?? []
  if (!ordered.length) return []

  const { data: reservedIds, error: rpcError } = await admin.rpc('reserve_preparations', {
    p_user: userId,
    p_opportunity_ids: ordered.map(o => o.id),
    p_max: NIGHTLY_AUTO_PREP,
  })
  if (rpcError) throw rpcError
  const reserved = new Set<string>((reservedIds as string[] | null) ?? [])

  const decidedAt = now.toISOString()
  let selectionRank = 0
  for (const [i, o] of ordered.entries()) {
    const selected = reserved.has(o.id)
    const decision: PreparationDecision = {
      jobPostingId: o.job_id,
      userId,
      selectedForPreparation: selected,
      selectionRank: selected ? ++selectionRank : null,
      reason: selected ? 'top_ranked_auto' : i < NIGHTLY_AUTO_PREP ? 'quota_exceeded' : 'score_insufficient',
      decidedAt,
    }
    await admin.from('opportunities').update({ preparation_decision: decision }).eq('id', o.id)
  }
  return [...reserved]
}

// ── Stage 7 — application package generation ───────────────────────────────

const PackageOutput = z.object({
  resume_changes: z.array(
    z.object({
      section: z.enum(RESUME_SECTIONS as [string, ...string[]]),
      change_type: z.enum(RESUME_CHANGE_TYPES as [string, ...string[]]),
      original_text: z.string(),
      revised_text: z.string(),
      rationale: z.string(),
      evidence_refs: z.array(z.string()),
    }),
  ),
  tailored_resume_text: z.string(),
  cover_letter: z.array(
    z.object({
      segment_type: z.enum(COVER_LETTER_SEGMENT_TYPES as [string, ...string[]]),
      text: z.string(),
      evidence_refs: z.array(z.string()),
    }),
  ),
})
type PackageRaw = z.infer<typeof PackageOutput>

const SYSTEM = `You prepare a job application for a candidate: a tailored version of their resume and a cover letter.

Hard rules:
- Use only facts from the candidate's resume and the job posting. Never invent employers, titles, dates, numbers, metrics, skills, tools or achievements. Do not calculate new numbers.
- Tailoring means reordering, rewording and emphasising what is already true, and removing what is irrelevant. Keep every employer, title and date.
- resume_changes: each change to the base resume. original_text must be copied word for word from the resume (empty for "added"); revised_text is the new text (empty for "removed"). rationale: one plain sentence the candidate will read ("Why was this changed?"). evidence_refs: the evidence ids (E1, E2, …) that motivated it.
- tailored_resume_text: the complete tailored resume as plain text with clear section headings.
- cover_letter: four segments in order — opening (why this role), fit_argument (why they fit, from skills and experience), goal_alignment (why this role fits their stated target), closing (a short call to action). Cite evidence ids for every factual claim.

Cover letter style: written by the candidate in the first person, plain and direct, 250–350 words in total. Do not open with "I am writing to apply". Avoid "I am excited to", "I am passionate about", "dynamic", "fast-paced", "leverage". No greeting line and no sign-off; the body only.`

export class PackageError extends Error {}

export type PackageEvidence = { id: string; claim: string; source_text: string; outcome: string }

/** Checks a generated package against the sources. Returns the problems found. */
export function validatePackage(raw: PackageRaw, ctx: Pick<SearchContext, 'resumeCorpus' | 'resume'>, jobDoc: string, refs: Map<string, string>) {
  const sources = [ctx.resumeCorpus, jobDoc]
  const problems: string[] = []
  const changes: ResumeChange[] = []
  const toIds = (list: string[]) => [...new Set(list.map(r => refs.get(r.trim())).filter((v): v is string => Boolean(v)))]

  for (const c of raw.resume_changes) {
    const original = c.original_text.trim() || null
    const revised = c.revised_text.trim() || null
    if (c.change_type !== 'added' && (!original || !containsQuote(ctx.resumeCorpus, original))) continue
    if (c.change_type === 'added' && !revised) continue
    if (revised && unsupportedNumbers(revised, sources).length) continue
    const evidenceRecordIds = toIds(c.evidence_refs)
    if (c.change_type === 'added' && !evidenceRecordIds.length) continue
    changes.push({
      section: c.section as ResumeChange['section'],
      changeType: c.change_type as ResumeChange['changeType'],
      originalText: c.change_type === 'added' ? null : original,
      revisedText: c.change_type === 'removed' ? null : revised,
      rationale: c.rationale.trim(),
      evidenceRecordIds,
    })
  }

  const tailored = raw.tailored_resume_text.trim()
  const tailoredNumbers = unsupportedNumbers(tailored, sources)
  if (!tailored) problems.push('tailored resume is empty')
  if (tailoredNumbers.length) problems.push(`tailored resume has unsupported numbers: ${tailoredNumbers.join(', ')}`)
  const missingEmployers = ctx.resume.experience
    .map(e => e.company)
    .filter(c => c && !normalizeForMatch(tailored).includes(normalizeForMatch(c)))
  if (missingEmployers.length) problems.push(`tailored resume dropped employers: ${missingEmployers.join(', ')}`)

  const segments: CoverLetterSegment[] = raw.cover_letter
    .filter(s => s.text.trim())
    .map(s => ({ segmentType: s.segment_type as CoverLetterSegment['segmentType'], text: s.text.trim(), evidenceRecordIds: toIds(s.evidence_refs) }))
  const order = COVER_LETTER_SEGMENT_TYPES
  if (segments.map(s => s.segmentType).join() !== order.join()) problems.push('cover letter segments are missing or out of order')
  for (const s of segments) {
    const nums = unsupportedNumbers(s.text, sources)
    if (nums.length) problems.push(`cover letter ${s.segmentType} has unsupported numbers: ${nums.join(', ')}`)
    if ((s.segmentType === 'fit_argument' || s.segmentType === 'goal_alignment') && !s.evidenceRecordIds.length) {
      problems.push(`cover letter ${s.segmentType} cites no evidence`)
    }
  }

  return { problems, changes, tailored, segments }
}

async function callGenerator(ctx: SearchContext, jobDoc: string, evidence: PackageEvidence[], feedback: string | null): Promise<PackageRaw> {
  const evidenceList = evidence.map((e, i) => `E${i + 1} [${e.outcome}] ${e.claim} — “${e.source_text}”`).join('\n')
  let response
  try {
    response = await getAnthropic().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 12000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `<candidate_resume>\n${ctx.resumeForPrompt}\n</candidate_resume>\n\n<candidate_preferences>\n${ctx.preferencesText}\n</candidate_preferences>\n\n` +
            `<job_posting>\n${jobDoc.slice(0, 30_000)}\n</job_posting>\n\n<evidence>\n${evidenceList}\n</evidence>` +
            (feedback ? `\n\nA previous attempt was rejected for these reasons; fix them:\n${feedback}` : ''),
        },
      ],
      output_config: { format: zodOutputFormat(PackageOutput) },
    })
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new PackageError(`Claude API error ${err.status}: ${err.message}`)
    throw err
  }
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new PackageError(`Unusable package response (${response.stop_reason})`)
  }
  return response.parsed_output
}

const GENERATION_ATTEMPTS = 2

/** Generates and stores the package; the opportunity becomes Ready and an application is created. */
export async function generatePackage(admin: SupabaseClient, opportunityId: string): Promise<void> {
  const { data: opp, error } = await admin
    .from('opportunities')
    .select(`id, user_id, search_id, run_id, job_id, state, jobs(title, company, location, salary_min, salary_max, salary_currency, description)`)
    .eq('id', opportunityId)
    .single()
  if (error) throw error
  if (opp.state !== 'preparing') return

  const { data: pkg } = await admin.from('application_packages').select('id, attempts').eq('opportunity_id', opportunityId).single()
  if (!pkg) throw new PackageError('No reserved package')

  const ctx = await loadSearchContext(admin, opp.search_id)
  const jobDoc = jobDocument(opp.jobs as unknown as Parameters<typeof jobDocument>[0])
  const { data: evidence } = await admin
    .from('evidence')
    .select('id, claim, source_text, outcome')
    .eq('opportunity_id', opportunityId)
    .neq('outcome', 'unknown')
  const list = (evidence ?? []) as PackageEvidence[]
  const refs = new Map(list.map((e, i) => [`E${i + 1}`, e.id]))

  let feedback: string | null = null
  for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt++) {
    await admin.from('application_packages').update({ attempts: (pkg.attempts ?? 0) + attempt }).eq('id', pkg.id)
    const raw = await callGenerator(ctx, jobDoc, list, feedback)
    const result = validatePackage(raw, ctx, jobDoc, refs)
    if (result.problems.length) {
      feedback = result.problems.join('\n')
      continue
    }
    const now = new Date().toISOString()
    const coverLetterText = result.segments.map(s => s.text).join('\n\n')
    const { error: pkgError } = await admin
      .from('application_packages')
      .update({
        status: 'ready',
        resume_changes: result.changes,
        tailored_resume_text: result.tailored,
        tailored_resume: { text: result.tailored },
        has_changes: result.changes.length > 0,
        cover_letter_segments: result.segments,
        cover_letter_text: coverLetterText,
        generation_model: CLAUDE_MODEL,
        completed_at: now,
        error: null,
      })
      .eq('id', pkg.id)
    if (pkgError) throw pkgError
    await admin.from('opportunities').update({ state: 'ready', ready_at: now }).eq('id', opportunityId)
    const { data: application, error: appError } = await admin
      .from('applications')
      .upsert(
        { user_id: opp.user_id, opportunity_id: opportunityId, package_id: pkg.id, job_id: opp.job_id, status: 'ready_to_apply' },
        { onConflict: 'user_id,opportunity_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    if (appError) throw appError
    if (opp.run_id) {
      const { error: countError } = await admin.rpc('record_prepared', { p_run: opp.run_id, p_opportunity: opportunityId })
      if (countError) throw countError
    }
    await admin.from('activity').insert({
      user_id: opp.user_id,
      kind: 'application_prepared',
      opportunity_id: opportunityId,
      application_id: application?.id ?? null,
      payload: {},
    })
    return
  }
  throw new PackageError(`Generated package failed validation: ${feedback}`)
}

/** After the final failed attempt: release the quota and return the opportunity to Shortlisted. */
export async function failPackage(admin: SupabaseClient, opportunityId: string, reason: string): Promise<void> {
  await admin.from('application_packages').update({ status: 'failed', error: reason.slice(0, 1000) }).eq('opportunity_id', opportunityId)
  await admin
    .from('opportunities')
    .update({ state: 'shortlisted', preparing_started_at: null })
    .eq('id', opportunityId)
    .eq('state', 'preparing')
}
