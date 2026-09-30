import type { ScoreDimension, ScoreDimensionType } from './schema'

// Stage 3 — multi-dimensional scoring, and Stage 4 — goal-alignment-gated ranking.

/**
 * [DERIVED] Dimension weights (schema assumption #4: implementation-defined,
 * sum = 1). A dimension with no stored evidence is unknown and is left out;
 * the remaining weights are renormalised, so missing evidence never lowers a
 * score ("absence of evidence = unknown, never negative").
 */
export const DIMENSION_WEIGHTS: Record<ScoreDimensionType, number> = {
  skills_match: 0.3,
  experience_level: 0.2,
  role_category_fit: 0.2,
  industry_fit: 0.15,
  location_fit: 0.1,
  compensation_fit: 0.05,
}

/** Shortlisting threshold (product decision, 2026-09-30). */
export const SHORTLIST_MIN_SCORE = 60
/** New shortlisted roles per search per night (product decision, 2026-09-30). */
export const SHORTLIST_MAX_PER_NIGHT = 10
/** At least this many AI-judged dimensions must have evidence to produce a score. */
export const MIN_SCORED_DIMENSIONS = 2

export type KnownDimension = { dimension: ScoreDimensionType; score: number; evidenceRecordIds: string[] }

export function compositeScore(known: KnownDimension[]): { matchScore: number | null; dimensions: ScoreDimension[] } {
  const usable = known.filter(d => d.evidenceRecordIds.length > 0)
  const aiJudged = usable.filter(d => d.dimension !== 'location_fit' && d.dimension !== 'compensation_fit')
  if (aiJudged.length < MIN_SCORED_DIMENSIONS) return { matchScore: null, dimensions: [] }

  const total = usable.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d.dimension], 0)
  const dimensions: ScoreDimension[] = usable.map(d => ({
    dimension: d.dimension,
    score: Math.round(Math.min(100, Math.max(0, d.score))),
    weight: Math.round((DIMENSION_WEIGHTS[d.dimension] / total) * 1000) / 1000,
    evidenceRecordIds: d.evidenceRecordIds,
  }))
  const weighted = dimensions.reduce((sum, d) => sum + d.score * (DIMENSION_WEIGHTS[d.dimension] / total), 0)
  return { matchScore: Math.round(weighted), dimensions }
}

export type Rankable = {
  id: string
  goalAligned: boolean
  industryMatch: boolean
  matchScore: number
  postedAt?: string | null
}

/**
 * [DERIVED] Tie-break score within an alignment tier (schema: 0–1 float).
 * Industry match decides ties within the aligned group (product decision).
 */
export function alignmentScore(goalAligned: boolean, industryMatch: boolean): number {
  if (goalAligned) return industryMatch ? 1 : 0.75
  return industryMatch ? 0.25 : 0
}

/**
 * LOCKED: goal alignment gates final rank regardless of fit score — a
 * non-aligned opportunity can never rank above an aligned one. Within a tier:
 * industry match, then match score, then the newer posting.
 */
export function rankOpportunities<T extends Rankable>(items: T[]): (T & { finalRank: number })[] {
  return [...items]
    .sort((a, b) => {
      if (a.goalAligned !== b.goalAligned) return a.goalAligned ? -1 : 1
      if (a.industryMatch !== b.industryMatch) return a.industryMatch ? -1 : 1
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore
      return (b.postedAt ?? '').localeCompare(a.postedAt ?? '')
    })
    .map((item, i) => ({ ...item, finalRank: i + 1 }))
}
