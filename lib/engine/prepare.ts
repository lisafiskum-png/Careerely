import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { CLAUDE_MODEL, getAnthropic } from '../ai'
import { AUTO_PREP_BATCH } from '../plans'
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
 * Prepares the strongest currently shortlisted opportunities: at most
 * AUTO_PREP_BATCH per decision and never beyond the monthly allowance.
 * The reservation happens in the database so concurrent workers cannot
 * overspend. Unselected opportunities remain shortlisted.
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
    p_max: AUTO_PREP_BATCH,
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
      reason: selected ? 'top_ranked_auto' : i < AUTO_PREP_BATCH ? 'quota_exceeded' : 'score_insufficient',
      decidedAt,
    }
    const { error: decisionError } = await admin.from('opportunities').update({ preparation_decision: decision }).eq('id', o.id)
    if (decisionError) throw decisionError
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

/**
 * Generates and atomically finalizes one specific package reservation.
 * packageId is embedded in new queue tasks so an obsolete task can never
 * mutate a later reservation for the same opportunity.
 */
export async function generatePackage(admin: SupabaseClient, opportunityId: string, packageId?: string): Promise<void> {
  const { data: opp, error } = await admin
    .from('opportunities')
    .select(`id, user_id, search_id, run_id, job_id, state, jobs(title, company, location, salary_min, salary_max, salary_currency, description)`)
    .eq('id', opportunityId)
    .single()
  if (error) throw error

  let packageQuery = admin.from('application_packages').select('id, status, attempts').eq('opportunity_id', opportunityId)
  if (packageId) packageQuery = packageQuery.eq('id', packageId)
  const { data: pkg, error: packageError } = await packageQuery.maybeSingle()
  if (packageError) throw packageError
  if (!pkg) {
    if (packageId) return
    throw new PackageError('No reserved package')
  }
  if (pkg.status === 'ready' || pkg.status === 'failed') return
  if (opp.state !== 'preparing') return

  const ctx = await loadSearchContext(admin, opp.search_id)
  const jobDoc = jobDocument(opp.jobs as unknown as Parameters<typeof jobDocument>[0])
  const { data: evidence, error: evidenceError } = await admin
    .from('evidence')
    .select('id, claim, source_text, outcome')
    .eq('opportunity_id', opportunityId)
    .neq('outcome', 'unknown')
  if (evidenceError) throw evidenceError
  const list = (evidence ?? []) as PackageEvidence[]
  const refs = new Map(list.map((e, i) => [`E${i + 1}`, e.id]))

  let feedback: string | null = null
  for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt++) {
    const { error: attemptError } = await admin
      .from('application_packages')
      .update({ attempts: (pkg.attempts ?? 0) + attempt })
      .eq('id', pkg.id)
      .eq('status', 'preparing')
    if (attemptError) throw attemptError

    const raw = await callGenerator(ctx, jobDoc, list, feedback)
    const result = validatePackage(raw, ctx, jobDoc, refs)
    if (result.problems.length) {
      feedback = result.problems.join('\n')
      continue
    }

    const coverLetterText = result.segments.map(s => s.text).join('\n\n')
    const { error: finalizeError } = await admin.rpc('finalize_application_package', {
      p_opportunity: opportunityId,
      p_package: pkg.id,
      p_resume_changes: result.changes,
      p_tailored_resume_text: result.tailored,
      p_tailored_resume: { text: result.tailored },
      p_has_changes: result.changes.length > 0,
      p_cover_letter_segments: result.segments,
      p_cover_letter_text: coverLetterText,
      p_generation_model: CLAUDE_MODEL,
    })
    if (finalizeError) throw finalizeError
    return
  }
  throw new PackageError(`Generated package failed validation: ${feedback}`)
}

/** After the final failed queue attempt: atomically release this reservation's quota. */
export async function failPackage(admin: SupabaseClient, opportunityId: string, reason: string, packageId?: string): Promise<void> {
  let id = packageId
  if (!id) {
    const { data, error } = await admin
      .from('application_packages')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('status', 'preparing')
      .maybeSingle()
    if (error) throw error
    id = data?.id
  }
  if (!id) return

  const { error } = await admin.rpc('fail_application_package', {
    p_opportunity: opportunityId,
    p_package: id,
    p_reason: reason,
  })
  if (error) throw error
}
