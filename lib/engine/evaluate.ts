import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { CLAUDE_MODEL, getAnthropic } from '../ai'
import { EVIDENCE_SIGNAL_TYPES, EVIDENCE_SOURCE_TYPES } from './schema'
import type { RawEvaluation, Sources } from './verify'

// Stages 2–5 — one Claude call per candidate job. The model proposes
// requirement evaluations, dimension scores, goal alignment and a first-person
// reasoning paragraph, all pointing at evidence items it quotes from the
// sources. lib/engine/verify.ts then keeps only what can be traced.

const Evidence = z.object({
  key: z.string(),
  signal_type: z.enum(EVIDENCE_SIGNAL_TYPES as [string, ...string[]]),
  source_type: z.enum(EVIDENCE_SOURCE_TYPES as [string, ...string[]]),
  source_text: z.string(),
  claim: z.string(),
  outcome: z.enum(['confirmed', 'inferred', 'unknown']),
  confidence: z.number(),
})

const Dimension = z.object({ score: z.number(), evidence_keys: z.array(z.string()) })

export const EvaluationOutput = z.object({
  evidence: z.array(Evidence),
  requirements: z.array(
    z.object({
      requirement_text: z.string(),
      outcome: z.enum(['confirmed', 'inferred', 'unknown']),
      evidence_keys: z.array(z.string()),
      confidence: z.number(),
      notes: z.string(),
    }),
  ),
  dimensions: z.object({
    skills_match: Dimension,
    experience_level: Dimension,
    industry_fit: Dimension,
    role_category_fit: Dimension,
  }),
  goal: z.object({
    matched_target_role: z.string(),
    industry_match: z.boolean(),
    evidence_keys: z.array(z.string()),
  }),
  reasoning: z.object({ text: z.string(), evidence_keys: z.array(z.string()) }),
})

const SYSTEM = `You are Careerely's Opportunity Engine. You evaluate one job posting for one candidate and return structured, evidence-backed findings.

Evidence rules (strict):
- Every finding must point to evidence items you list in "evidence". Give each a short unique key (e1, e2, ...).
- source_text must be copied word for word from the named source: the candidate's resume (resume_text), the job posting (job_description) or the candidate's stated preferences (user_preference). Use agent_inference only for your own judgment, and still copy the supporting words from the resume or posting into source_text.
- outcome: "confirmed" only when the quoted text directly shows the claim. "inferred" when it is your judgment. "unknown" when the resume says nothing about it.
- Absence of evidence is "unknown", never negative. Never claim the candidate lacks something; say it could not be confirmed.
- Never invent numbers, years, employers, titles, skills or results. Do not do arithmetic on dates to produce new numbers.

What to return:
- requirements: the posting's key requirements (up to 10), each copied word for word from the posting, with outcome and supporting evidence keys. notes: one short sentence explaining the assessment.
- dimensions: 0–100 for skills_match, experience_level, industry_fit, role_category_fit, each with the evidence keys it rests on (empty list if there is none).
- goal.matched_target_role: exactly one of the candidate's target roles (copied exactly) if this job is that role or directly comparable to it; otherwise an empty string.
- goal.industry_match: true only if the posting shows the company works in one of the candidate's target industries; cite the posting.
- reasoning.text: 1–3 sentences in the first person ("I'd start here because…" / "I shortlisted this because…"), plain and specific, using only facts from your evidence items; cite their keys.`

export type EvaluationInput = Sources & { resumeForPrompt: string }

export class EvaluationError extends Error {}

/**
 * Candidate-level context (instructions, resume, preferences) goes in the
 * cached system prefix; only the job posting changes between calls.
 */
export async function evaluateJob(input: EvaluationInput): Promise<RawEvaluation> {
  let response
  try {
    response = await getAnthropic().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: [
        { type: 'text', text: SYSTEM },
        {
          type: 'text',
          text: `<candidate_resume>\n${input.resumeForPrompt}\n</candidate_resume>\n\n<candidate_preferences>\n${input.preferences}\n</candidate_preferences>\n\nCandidate target roles (copy exactly): ${input.targetRoles.map(r => `"${r}"`).join(', ')}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: `<job_posting>\n${input.job.slice(0, 30_000)}\n</job_posting>` }],
      output_config: { format: zodOutputFormat(EvaluationOutput) },
    })
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new EvaluationError(`Claude API error ${err.status}: ${err.message}`)
    throw err
  }
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new EvaluationError(`Unusable evaluation response (${response.stop_reason})`)
  }
  return response.parsed_output as RawEvaluation
}
