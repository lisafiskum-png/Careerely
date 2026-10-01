import type { EvidenceOutcome, EvidenceSignalType, EvidenceSourceType, ScoreDimensionType } from './schema'
import { containsQuote, lineSegments, normalizeForMatch, tokens, unsupportedNumbers } from './text'

// Verification of the model's Stage 2–5 output against the sources.
//
// The model proposes evidence; only evidence that can be traced is kept:
//   * resume_text / job_description / user_preference evidence must quote its
//     source verbatim (after whitespace/case/Unicode normalisation), on word
//     boundaries and within one line, bullet or resume field (text.ts);
//   * agent_inference must also quote the resume or the posting, and is never
//     "confirmed" (inferred claims are judgment, not fact);
//   * numbers in a claim must appear in the sources (no invented metrics).
// Requirements, dimensions and reasoning that end up without traceable
// evidence become "unknown" — never negative.

export type RawEvidence = {
  key: string
  signal_type: EvidenceSignalType
  source_type: EvidenceSourceType
  source_text: string
  claim: string
  outcome: EvidenceOutcome
  confidence: number
}

export type RawEvaluation = {
  evidence: RawEvidence[]
  requirements: { requirement_text: string; outcome: EvidenceOutcome; evidence_keys: string[]; confidence: number; notes: string }[]
  dimensions: Record<'skills_match' | 'experience_level' | 'industry_fit' | 'role_category_fit', { score: number; evidence_keys: string[] }>
  goal: { matched_target_role: string; industry_match: boolean; evidence_keys: string[] }
  reasoning: { text: string; evidence_keys: string[] }
}

export type Sources = {
  resume: string // raw resume text + the reviewed structured resume, flattened
  job: string // title, company, location, salary line and description
  preferences: string // target roles, industries, work styles, locations
  targetRoles: string[]
  jobTitle: string
}

export type VerifiedEvidence = Omit<RawEvidence, 'confidence'> & { confidence: number }

export type VerifiedEvaluation = {
  evidence: VerifiedEvidence[]
  requirements: { requirementText: string; outcome: EvidenceOutcome; evidenceKeys: string[]; confidence: number; notes: string | null }[]
  dimensions: { dimension: ScoreDimensionType; score: number; evidenceKeys: string[] }[]
  goal: { matchedTargetRole: string | null; aligned: boolean; industryMatch: boolean; evidenceKeys: string[] }
  reasoning: { text: string; evidenceKeys: string[] }
  dropped: { key: string; why: string }[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

function sourceFor(type: EvidenceSourceType, s: Sources): string[] {
  if (type === 'resume_text') return [s.resume]
  if (type === 'job_description') return lineSegments(s.job)
  if (type === 'user_preference') return lineSegments(s.preferences)
  return [s.resume, ...lineSegments(s.job)]
}

export function verifyEvaluation(raw: RawEvaluation, s: Sources): VerifiedEvaluation {
  const dropped: { key: string; why: string }[] = []
  const kept = new Map<string, VerifiedEvidence>()
  const allSources = [s.resume, s.job, s.preferences]

  for (const e of raw.evidence) {
    if (!e.key || kept.has(e.key)) continue
    const quoteOk = containsQuote(sourceFor(e.source_type, s), e.source_text)
    if (!quoteOk) {
      dropped.push({ key: e.key, why: `quote not found in ${e.source_type}` })
      continue
    }
    const missing = unsupportedNumbers(e.claim, allSources)
    if (missing.length) {
      dropped.push({ key: e.key, why: `unsupported numbers in claim: ${missing.join(', ')}` })
      continue
    }
    let outcome = e.outcome
    if (e.source_type === 'agent_inference' && outcome === 'confirmed') outcome = 'inferred'
    kept.set(e.key, { ...e, outcome, confidence: clamp01(e.confidence), claim: e.claim.trim(), source_text: e.source_text.trim() })
  }

  const validKeys = (keys: string[], allowUnknown = false) =>
    [...new Set(keys)].filter(k => kept.has(k) && (allowUnknown || kept.get(k)!.outcome !== 'unknown'))

  // Stage 2 — requirement evaluations. The requirement itself must be quoted from the posting.
  const requirements: VerifiedEvaluation['requirements'] = []
  const seenReq = new Set<string>()
  for (const r of raw.requirements) {
    const text = r.requirement_text.trim()
    const norm = normalizeForMatch(text)
    if (!text || seenReq.has(norm) || !containsQuote(lineSegments(s.job), text)) continue
    seenReq.add(norm)
    const supporting = validKeys(r.evidence_keys)
    let outcome: EvidenceOutcome = r.outcome
    if (!supporting.length) outcome = 'unknown'
    else if (outcome === 'confirmed' && !supporting.some(k => kept.get(k)!.outcome === 'confirmed')) outcome = 'inferred'
    requirements.push({
      requirementText: text,
      outcome,
      evidenceKeys: outcome === 'unknown' ? validKeys(r.evidence_keys, true) : supporting,
      confidence: outcome === 'unknown' ? 0 : clamp01(r.confidence),
      notes: r.notes?.trim() || null,
    })
  }

  // Stage 3 — AI-judged dimensions, only with traceable evidence.
  const dimensions: VerifiedEvaluation['dimensions'] = []
  for (const [dimension, d] of Object.entries(raw.dimensions) as [ScoreDimensionType, { score: number; evidence_keys: string[] }][]) {
    const keys = validKeys(d.evidence_keys)
    if (keys.length) dimensions.push({ dimension, score: Math.round(Math.min(100, Math.max(0, d.score))), evidenceKeys: keys })
  }

  // Stage 4 — goal alignment: the matched role must be one of the user's own target roles.
  const matched = s.targetRoles.find(r => normalizeForMatch(r) === normalizeForMatch(raw.goal.matched_target_role ?? '')) ?? null
  const industryKeys = validKeys(raw.goal.evidence_keys).filter(k => kept.get(k)!.signal_type === 'industry_experience' || kept.get(k)!.source_type === 'job_description')
  const goal = {
    matchedTargetRole: matched,
    aligned: matched !== null,
    industryMatch: Boolean(raw.goal.industry_match) && industryKeys.length > 0,
    evidenceKeys: validKeys(raw.goal.evidence_keys),
  }

  // Reasoning paragraph: must cite kept evidence and invent no numbers.
  let reasoning = { text: raw.reasoning.text.trim(), evidenceKeys: validKeys(raw.reasoning.evidence_keys) }
  if (!reasoning.text || !reasoning.evidenceKeys.length || unsupportedNumbers(reasoning.text, allSources).length) {
    reasoning = fallbackReasoning([...kept.values()])
  }

  return { evidence: [...kept.values()], requirements, dimensions, goal, reasoning, dropped }
}

/** Built only from verified claims when the model's paragraph can't be traced. */
export function fallbackReasoning(evidence: VerifiedEvidence[]): { text: string; evidenceKeys: string[] } {
  const top = evidence
    .filter(e => e.outcome !== 'unknown')
    .sort((a, b) => (a.outcome === b.outcome ? b.confidence - a.confidence : a.outcome === 'confirmed' ? -1 : 1))
    .slice(0, 2)
  if (!top.length) return { text: '', evidenceKeys: [] }
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, '')
  const text = top.length === 2 ? `I shortlisted this because ${lower(top[0].claim)}, and ${lower(top[1].claim)}.` : `I shortlisted this because ${lower(top[0].claim)}.`
  return { text, evidenceKeys: top.map(e => e.key) }
}

/**
 * Goal-alignment evidence built from facts, not model output: the target role
 * (user preference) and the job title. An exact title match is confirmed; a
 * comparable role is the agent's judgment (inferred).
 */
export function goalEvidence(targetRole: string, jobTitle: string): RawEvidence {
  const roleTokens = tokens(targetRole)
  const titleTokens = new Set(tokens(jobTitle))
  const exact = roleTokens.length > 0 && roleTokens.every(t => titleTokens.has(t))
  return exact
    ? {
        key: 'goal',
        signal_type: 'goal_alignment',
        source_type: 'user_preference',
        source_text: targetRole,
        claim: `The job title “${jobTitle}” matches your target role “${targetRole}”`,
        outcome: 'confirmed',
        confidence: 0.95,
      }
    : {
        key: 'goal',
        signal_type: 'goal_alignment',
        source_type: 'agent_inference',
        source_text: jobTitle,
        claim: `I judged “${jobTitle}” to be comparable to your target role “${targetRole}”`,
        outcome: 'inferred',
        confidence: 0.7,
      }
}

/** The two strongest evidence points for the pick card (LOCKED: max two). */
export function primaryEvidence<T extends { outcome: EvidenceOutcome; confidence: number; signal_type: EvidenceSignalType }>(evidence: T[]): T[] {
  const preferred: EvidenceSignalType[] = ['requirement_met', 'skills_keyword_match', 'industry_experience', 'experience_duration', 'seniority_inference']
  return evidence
    .filter(e => e.outcome === 'confirmed' && preferred.includes(e.signal_type))
    .sort((a, b) => b.confidence - a.confidence || preferred.indexOf(a.signal_type) - preferred.indexOf(b.signal_type))
    .slice(0, 2)
}
