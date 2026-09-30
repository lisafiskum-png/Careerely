// Types from OPPORTUNITY_ENGINE_SCHEMA.ts (repository root, the source of
// truth). That file declares its types without exporting them, so the ones the
// engine needs are re-declared here verbatim. tests/lib/engine-schema.test.ts
// fails if any union below drifts from the root file.

export type ISODateTime = string
export type ID = string
/** 0–100 integer. */
export type MatchScore = number

/** LOCKED: never "negative". */
export type EvidenceOutcome = 'confirmed' | 'inferred' | 'unknown'

export type WorkStyle = 'remote' | 'hybrid' | 'on_site'

export type HardFilterCriterionType =
  | 'location_mismatch'
  | 'compensation_below_floor'
  | 'role_category_mismatch'
  | 'duplicate_posting'
  | 'expired_posting'

export interface HardFilterCriterion {
  criterion: HardFilterCriterionType
  reason: string
}

export interface HardFilterResult {
  jobPostingId: ID
  passed: boolean
  failedCriteria: HardFilterCriterion[]
  evaluatedAt: ISODateTime
}

export interface RequirementEvaluation {
  requirementText: string
  outcome: EvidenceOutcome
  evidenceRecordIds: ID[]
  confidence: number
  notes: string | null
}

export type ScoreDimensionType =
  | 'skills_match'
  | 'experience_level'
  | 'industry_fit'
  | 'location_fit'
  | 'compensation_fit'
  | 'role_category_fit'

export interface ScoreDimension {
  dimension: ScoreDimensionType
  score: number
  weight: number
  evidenceRecordIds: ID[]
}

export type EvidenceSignalType =
  | 'skills_keyword_match'
  | 'experience_duration'
  | 'seniority_inference'
  | 'industry_experience'
  | 'location_compatibility'
  | 'compensation_compatibility'
  | 'goal_alignment'
  | 'requirement_met'
  | 'requirement_partial'
  | 'requirement_unverifiable'

export type EvidenceSourceType = 'resume_text' | 'job_description' | 'user_preference' | 'agent_inference'

export type RejectionReason =
  | 'failed_hard_filter'
  | 'score_below_threshold'
  | 'goal_misalignment'
  | 'dismissed_by_user'
  | 'quota_not_selected'

export type OpportunityPipelineStage =
  | 'stage_1_hard_filter'
  | 'stage_2_relevance'
  | 'stage_3_scoring'
  | 'stage_4_goal_alignment'
  | 'stage_5_evidence'
  | 'stage_6_preparation_decision'
  | 'stage_7_package_generation'

export type PreparationDecisionReason = 'top_ranked_auto' | 'manually_requested' | 'quota_exceeded' | 'score_insufficient'

export interface PreparationDecision {
  jobPostingId: ID
  userId: ID
  selectedForPreparation: boolean
  selectionRank: number | null
  reason: PreparationDecisionReason
  decidedAt: ISODateTime
}

export type ResumeSection = 'summary' | 'experience_bullet' | 'skills' | 'headline' | 'education' | 'certifications' | 'other'

export type ResumeChangeType = 'reworded' | 'added' | 'removed' | 'reordered'

export interface ResumeChange {
  section: ResumeSection
  changeType: ResumeChangeType
  originalText: string | null
  revisedText: string | null
  rationale: string
  evidenceRecordIds: ID[]
}

export type CoverLetterSegmentType = 'opening' | 'fit_argument' | 'goal_alignment' | 'closing'

export interface CoverLetterSegment {
  segmentType: CoverLetterSegmentType
  text: string
  evidenceRecordIds: ID[]
}

export type OpportunityState = 'shortlisted' | 'preparing' | 'ready'

/** Pipeline stage → the smallint stored in public.rejections.stage. */
export const STAGE_NUMBER: Record<OpportunityPipelineStage, number> = {
  stage_1_hard_filter: 1,
  stage_2_relevance: 2,
  stage_3_scoring: 3,
  stage_4_goal_alignment: 4,
  stage_5_evidence: 5,
  stage_6_preparation_decision: 6,
  stage_7_package_generation: 7,
}

export const EVIDENCE_SIGNAL_TYPES: EvidenceSignalType[] = [
  'skills_keyword_match', 'experience_duration', 'seniority_inference', 'industry_experience',
  'location_compatibility', 'compensation_compatibility', 'goal_alignment',
  'requirement_met', 'requirement_partial', 'requirement_unverifiable',
]
export const EVIDENCE_SOURCE_TYPES: EvidenceSourceType[] = ['resume_text', 'job_description', 'user_preference', 'agent_inference']
export const RESUME_SECTIONS: ResumeSection[] = ['summary', 'experience_bullet', 'skills', 'headline', 'education', 'certifications', 'other']
export const RESUME_CHANGE_TYPES: ResumeChangeType[] = ['reworded', 'added', 'removed', 'reordered']
export const COVER_LETTER_SEGMENT_TYPES: CoverLetterSegmentType[] = ['opening', 'fit_argument', 'goal_alignment', 'closing']
