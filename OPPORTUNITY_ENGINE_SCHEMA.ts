/**
 * CAREERELY — OPPORTUNITY ENGINE SCHEMA
 * ======================================
 * Source of truth for Phase C implementation.
 *
 * Derived strictly from locked product decisions in CAREERELY_MASTER.md,
 * PRODUCT_DECISIONS.md, and POST_LAUNCH.md.
 *
 * Every field marked [DERIVED] was not explicitly specified in the product
 * decisions and had to be inferred to make the spec implementable.
 * See DERIVED ASSUMPTIONS at the bottom of this file.
 *
 * Last updated: 2026-09-30
 * DO NOT modify without updating CAREERELY_MASTER.md §8 accordingly.
 */

// =============================================================================
// STAGE 0: SHARED PRIMITIVES
// =============================================================================

/** ISO 8601 datetime string. [DERIVED] Using string over Date for JSON safety. */
type ISODateTime = string;

/** 0–100 integer. Never a float — displayed as a whole number in the UI. */
type MatchScore = number;

/**
 * LOCKED: Absence of evidence must resolve to "unknown", never to a negative
 * signal. This type enforces that at the type level.
 */
type EvidenceOutcome = "confirmed" | "inferred" | "unknown";
// "negative" is intentionally excluded. See PRODUCT_DECISIONS.md:
// "Evidence absence = 'unknown,' never 'negative.'"

/** Unique identifier. [DERIVED] Using string to support both UUID and Supabase row IDs. */
type ID = string;


// =============================================================================
// STAGE 0: USER PROFILE & PREFERENCES
// =============================================================================

/**
 * LOCKED: Preference precedence hierarchy.
 * Explicit onboarding > Behavioral signals > Interaction history.
 * In V1, only the Explicit layer is active. Behavioral and Interaction
 * layers exist in the schema but are NOT populated in V1.
 * See POST_LAUNCH.md: "Behavioral signal accumulation — post-launch only."
 */
interface UserPreferences {
  /** Highest priority. Set during onboarding Step 3. Always active in V1. */
  explicit: ExplicitPreferences;

  /**
   * POST-LAUNCH ONLY. Accumulates from usage patterns (opens, dismissals, applies).
   * In V1: null. Schema exists for forward compatibility.
   * See POST_LAUNCH.md: "Behavioral signal accumulation."
   */
  behavioral: BehavioralSignals | null; // TODO: POST-LAUNCH

  /**
   * POST-LAUNCH ONLY. Lowest weight. Derived from long-term interaction history.
   * In V1: null.
   */
  interactionHistory: InteractionHistory | null; // TODO: POST-LAUNCH
}

/** Set during onboarding Step 3. The only active preference layer in V1. */
interface ExplicitPreferences {
  targetRoles: string[];          // e.g. ["Account Executive", "Business Development Lead"]
  targetIndustries: string[];     // e.g. ["Fintech", "AI/SaaS", "Crypto/Web3"]
  targetLocations: string[];      // e.g. ["Remote", "London", "Oslo"]
  workStyles: WorkStyle[];        // e.g. ["Remote", "Hybrid"]
  minimumCompensation: CompensationPreference | null;

  /**
   * LOCKED: Career goal — the primary alignment gate for final ranking.
   * Goal alignment gates final rank regardless of fit score.
   */
  primaryGoal: CareerGoal;

  /** [DERIVED] Seniority level preferences from onboarding. */
  seniorityLevels: SeniorityLevel[];
}

/** [DERIVED] Structural representation of a compensation floor. */
interface CompensationPreference {
  amount: number;
  currency: string; // ISO 4217, e.g. "USD", "GBP", "NOK"
  period: "annual" | "monthly"; // [DERIVED]
}

/**
 * LOCKED: Goal alignment gates final ranking regardless of fit score.
 * An opportunity that doesn't align with the primary goal cannot rank
 * above one that does, regardless of its composite score.
 */
type CareerGoal =
  | "transition_to_new_industry"
  | "move_into_leadership"
  | "stay_in_current_track"
  | "move_remote"
  | "increase_compensation"
  | "join_startup"
  | "join_enterprise"; // [DERIVED] Enum values derived from onboarding Step 3 options

type WorkStyle = "remote" | "hybrid" | "on_site";

type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "director" | "vp" | "c_level"; // [DERIVED]

/**
 * POST-LAUNCH ONLY. Not collected in V1.
 * See POST_LAUNCH.md: "Behavioral signal accumulation."
 */
interface BehavioralSignals {
  dismissedOpportunityIds: ID[];
  dismissReasons: DismissReason[];          // collected but not acted on in V1 UX
  openedOpportunityIds: ID[];
  appliedOpportunityIds: ID[];
  // TODO: POST-LAUNCH — used to update preference model
}

/**
 * POST-LAUNCH ONLY.
 * See POST_LAUNCH.md: "Smart preference update prompts."
 */
interface InteractionHistory {
  // TODO: POST-LAUNCH
  sessionCount: number;
  lastActiveAt: ISODateTime;
}


// =============================================================================
// STAGE 0: JOB POSTING (INPUT)
// =============================================================================

/**
 * Raw job posting as ingested from the job data source.
 * [DERIVED] Field shape. The job data source integration is not yet defined.
 */
interface JobPosting {
  id: ID;
  sourceId: string;           // ID from the originating job data provider
  sourceUrl: string;          // canonical job listing URL
  title: string;
  companyName: string;
  companyDomain: string | null; // used for Clearbit logo lookup
  location: string;
  workStyle: WorkStyle | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  description: string;        // raw job description text
  requirements: string[];     // extracted requirement strings [DERIVED]
  postedAt: ISODateTime | null;
  scrapedAt: ISODateTime;
  isActive: boolean;
}


// =============================================================================
// STAGE 1: HARD ELIGIBILITY FILTERING
// =============================================================================

/**
 * Stage 1: Hard eligibility filter.
 * Removes fundamentally mismatched roles before scoring begins.
 * A posting that fails hard eligibility is NEVER shown to the user —
 * it is logged but not surfaced.
 *
 * LOCKED: Rejected opportunities are logged, never silently dropped.
 */
interface HardFilterResult {
  jobPostingId: ID;
  passed: boolean;
  failedCriteria: HardFilterCriterion[]; // empty if passed
  evaluatedAt: ISODateTime;
}

/**
 * Each criterion that can eliminate a posting at Stage 1.
 * [DERIVED] Criterion types derived from product spec constraints
 * (compensation floor, location mismatch, etc.)
 */
interface HardFilterCriterion {
  criterion: HardFilterCriterionType;
  reason: string; // human-readable explanation for the log
}

type HardFilterCriterionType =
  | "location_mismatch"         // user requires remote; role is on-site only
  | "compensation_below_floor"  // stated max salary < user's minimum (when both are known)
  | "role_category_mismatch"    // role type fundamentally outside target categories
  | "duplicate_posting"         // same role already seen from another source
  | "expired_posting";          // posting is no longer active


// =============================================================================
// STAGE 2: RELEVANCE EVALUATION
// =============================================================================

/**
 * Stage 2: Relevance evaluation.
 * Scores individual requirements against the user's resume and profile.
 * Every claim must trace to a stored evidence record.
 *
 * LOCKED: Every UI claim must trace to a stored evidence record.
 * LOCKED: Absence of evidence = "unknown", never negative.
 */
interface RelevanceEvaluation {
  jobPostingId: ID;
  userId: ID;
  requirements: RequirementEvaluation[];
  evaluatedAt: ISODateTime;
}

interface RequirementEvaluation {
  requirementText: string;        // original requirement text from job posting
  outcome: EvidenceOutcome;       // "confirmed" | "inferred" | "unknown"
  evidenceRecordIds: ID[];        // links to EvidenceRecord — required if outcome !== "unknown"
  confidence: number;             // 0–1 float [DERIVED]
  notes: string | null;           // agent's reasoning; shown to user in panel
}


// =============================================================================
// STAGE 3: MULTI-DIMENSIONAL SCORING
// =============================================================================

/**
 * Stage 3: Composite score across multiple dimensions.
 * The final matchScore (0–100) is displayed to the user as a whole number.
 * No gauge, ring, or progress bar — displayed as a large number only.
 *
 * LOCKED: "No gauge, ring, or progress bar for match percentage."
 */
interface CompositeScore {
  jobPostingId: ID;
  userId: ID;

  /** Final 0–100 integer displayed in the UI. */
  matchScore: MatchScore;

  /** Breakdown by dimension. [DERIVED] Weights are implementation-defined. */
  dimensions: ScoreDimension[];

  scoredAt: ISODateTime;
}

interface ScoreDimension {
  dimension: ScoreDimensionType;
  score: number;          // 0–100
  weight: number;         // 0–1, sum of all weights = 1 [DERIVED]
  evidenceRecordIds: ID[];
}

type ScoreDimensionType =
  | "skills_match"
  | "experience_level"
  | "industry_fit"
  | "location_fit"
  | "compensation_fit"
  | "role_category_fit"; // [DERIVED]


// =============================================================================
// STAGE 4: GOAL-ALIGNMENT-GATED RANKING
// =============================================================================

/**
 * Stage 4: Goal alignment evaluation.
 *
 * LOCKED: Goal alignment gates final rank regardless of fit score.
 * An opportunity with high composite score but poor goal alignment
 * MUST rank below one with lower composite score but strong goal alignment.
 *
 * This is a hard architectural rule, not a tuning parameter.
 */
interface GoalAlignmentResult {
  jobPostingId: ID;
  userId: ID;
  primaryGoal: CareerGoal;

  /** Whether this opportunity genuinely supports the user's stated primary goal. */
  alignsWithGoal: boolean;

  /**
   * 0–1 float. Used to break ties within the same alignment tier. [DERIVED]
   * alignsWithGoal = false → always ranks below alignsWithGoal = true,
   * regardless of alignmentScore value.
   */
  alignmentScore: number;

  reasoning: string; // agent's explanation; traceable evidence required
  evidenceRecordIds: ID[];
}

/**
 * The ranking record that combines composite score + goal alignment.
 * This is the output of Stage 4 and the input to Stage 6.
 */
interface RankedOpportunity {
  jobPostingId: ID;
  userId: ID;
  compositeScore: MatchScore;
  goalAlignmentResult: GoalAlignmentResult;

  /**
   * Final rank position.
   * LOCKED: Goal alignment gates this — a non-aligned opportunity
   * can never rank above an aligned one regardless of compositeScore.
   */
  finalRank: number;

  rankedAt: ISODateTime;
}


// =============================================================================
// STAGE 5: EVIDENCE STORAGE
// =============================================================================

/**
 * Stage 5: Evidence record.
 *
 * LOCKED: Every UI claim must trace to a stored evidence record.
 * LOCKED: Inferred claims are judgment, not fact; no metrics may be invented.
 *
 * Every match chip, reasoning paragraph, requirement evaluation, and
 * goal alignment claim must reference one or more EvidenceRecords.
 */
interface EvidenceRecord {
  id: ID;
  jobPostingId: ID;
  userId: ID;

  /** What kind of signal produced this evidence. */
  signalType: EvidenceSignalType;

  /** The raw text from the resume, job posting, or user profile that supports this claim. */
  sourceText: string;

  /** The claim being made, in plain language. */
  claim: string;

  /** LOCKED: Must be "confirmed", "inferred", or "unknown". Never "negative". */
  outcome: EvidenceOutcome;

  /** Confidence in the claim. 0–1 float. [DERIVED] */
  confidence: number;

  /** Where this evidence came from. */
  sourceType: EvidenceSourceType;

  createdAt: ISODateTime;
}

type EvidenceSignalType =
  | "skills_keyword_match"      // exact or synonym keyword found in resume
  | "experience_duration"       // years of experience in a domain
  | "seniority_inference"       // title/level inferred from resume
  | "industry_experience"       // industry domain present in resume
  | "location_compatibility"    // location/remote preference alignment
  | "compensation_compatibility"// salary range vs user floor
  | "goal_alignment"            // alignment with stated career goal
  | "requirement_met"           // specific job requirement addressed
  | "requirement_partial"       // requirement partially addressed
  | "requirement_unverifiable"; // requirement cannot be confirmed or denied

type EvidenceSourceType =
  | "resume_text"       // extracted from parsed resume
  | "job_description"   // extracted from job posting text
  | "user_preference"   // from onboarding explicit preferences
  | "agent_inference";  // agent judgment — must be labeled as such in UI

/**
 * Rejection log.
 * LOCKED: Rejected opportunities are logged, never silently dropped.
 */
interface RejectionRecord {
  id: ID;
  jobPostingId: ID;
  userId: ID;
  stage: OpportunityPipelineStage;
  reason: RejectionReason;
  detail: string;
  rejectedAt: ISODateTime;
}

type RejectionReason =
  | "failed_hard_filter"
  | "score_below_threshold"   // [DERIVED] threshold is implementation-defined
  | "goal_misalignment"
  | "dismissed_by_user"
  | "quota_not_selected";     // ranked but not selected for preparation quota

type OpportunityPipelineStage =
  | "stage_1_hard_filter"
  | "stage_2_relevance"
  | "stage_3_scoring"
  | "stage_4_goal_alignment"
  | "stage_5_evidence"
  | "stage_6_preparation_decision"
  | "stage_7_package_generation";


// =============================================================================
// STAGE 6: PREPARATION DECISION
// =============================================================================

/**
 * Stage 6: Preparation decision.
 * Decides which opportunities to spend the preparation quota on.
 *
 * LOCKED: Top 2 opportunities prepared automatically each night,
 * consistent across all pricing tiers.
 *
 * LOCKED: "prepared: false" does NOT mean "Preparing."
 * Preparing is an explicit state, not the absence of prepared=true.
 */
interface PreparationDecision {
  jobPostingId: ID;
  userId: ID;
  selectedForPreparation: boolean;
  selectionRank: number | null;   // rank within the prepared set; null if not selected
  reason: PreparationDecisionReason;
  decidedAt: ISODateTime;
}

type PreparationDecisionReason =
  | "top_ranked_auto"         // selected as one of the nightly top 2
  | "manually_requested"      // user explicitly requested preparation [DERIVED]
  | "quota_exceeded"          // ranked but quota already full
  | "score_insufficient";     // not ranked highly enough to be selected


// =============================================================================
// STAGE 7: APPLICATION PACKAGE GENERATION
// =============================================================================

/**
 * Stage 7: Application package.
 * The tailored resume + cover letter produced for a specific opportunity.
 *
 * LOCKED: Agent uses first-person voice ("My pick", "I'd start here").
 * LOCKED: "Review application" — not "Apply" — as the primary CTA.
 * LOCKED: Resume changes and cover letter segments are distinct objects.
 */
interface ApplicationPackage {
  id: ID;
  jobPostingId: ID;
  userId: ID;

  resumeDelta: ResumeDelta;
  coverLetter: CoverLetter;

  generatedAt: ISODateTime;
  generationModel: string;    // e.g. "claude-sonnet-4-6" [DERIVED]
}

/**
 * Resume changes: what was tailored and why.
 * Each change is traceable to a specific requirement or evidence record.
 */
interface ResumeDelta {
  /** Changes applied to the base resume for this opportunity. */
  changes: ResumeChange[];

  /** Full tailored resume text, ready to render/export. */
  tailoredResumeText: string;

  /** Whether any substantive changes were made. */
  hasChanges: boolean;
}

interface ResumeChange {
  section: ResumeSection;
  changeType: ResumeChangeType;

  /** Original text before change. Null for additions. */
  originalText: string | null;

  /** New text after change. Null for removals. */
  revisedText: string | null;

  /** Plain-language explanation shown to the user ("Why was this changed?") */
  rationale: string;

  /** Evidence records that motivated this change. */
  evidenceRecordIds: ID[];
}

type ResumeSection =
  | "summary"
  | "experience_bullet"
  | "skills"
  | "headline"
  | "education"
  | "certifications"
  | "other"; // [DERIVED]

type ResumeChangeType =
  | "reworded"    // existing content reframed for this role
  | "added"       // new bullet/section added
  | "removed"     // content removed as irrelevant
  | "reordered";  // moved for emphasis [DERIVED]

/**
 * Cover letter: structured for user review.
 * Segmented so the user can read and edit section by section.
 */
interface CoverLetter {
  /** Full rendered text, ready to copy/export. */
  fullText: string;

  /** Structured segments for the review UI. */
  segments: CoverLetterSegment[];
}

interface CoverLetterSegment {
  segmentType: CoverLetterSegmentType;

  /** The generated text for this segment. */
  text: string;

  /**
   * Evidence records behind claims in this segment.
   * Every factual claim must be traceable.
   * LOCKED: Every UI claim must trace to a stored evidence record.
   */
  evidenceRecordIds: ID[];
}

type CoverLetterSegmentType =
  | "opening"           // hook / why this role
  | "fit_argument"      // why the user fits (skills + experience)
  | "goal_alignment"    // why this role aligns with their stated goal
  | "closing";          // call to action


// =============================================================================
// OPPORTUNITY STATES & TRANSITIONS
// =============================================================================

/**
 * LOCKED: Three distinct opportunity states.
 * "Preparing" is NOT the same as "prepared: false".
 * A Preparing opportunity is fully clickable and reviewable.
 *
 * Shortlisted → Preparing → Ready
 *
 * LOCKED: "Never show a time estimate (~5 min) — just 'Preparing application…'"
 */
type OpportunityState = "shortlisted" | "preparing" | "ready";

/**
 * An opportunity as seen by the UI layer.
 * This is the aggregated output of all 7 pipeline stages.
 */
interface Opportunity {
  id: ID;
  userId: ID;
  jobPosting: JobPosting;

  /** Current state in the preparation pipeline. */
  state: OpportunityState;

  /** Whether this opportunity is the agent's top pick ("My Pick"). [DERIVED] */
  isPick: boolean;

  /**
   * Match score (0–100) shown to the user as a large number.
   * LOCKED: No gauge, ring, or progress bar. Number only.
   */
  matchScore: MatchScore;

  /**
   * The two strongest evidence points shown on the My Pick card.
   * LOCKED: Only two evidence points shown on the pick card (not three+).
   */
  primaryEvidencePoints: [EvidenceRecord, EvidenceRecord] | [EvidenceRecord] | [];

  /**
   * Agent's reasoning paragraph.
   * LOCKED: Agent uses first-person voice.
   * LOCKED: Every claim in this paragraph must trace to stored evidence.
   */
  agentReasoning: string;

  /** IDs of evidence records supporting agentReasoning. */
  reasoningEvidenceIds: ID[];

  /** Final rank from Stage 4. Lower = better. */
  rank: number;

  goalAligned: boolean;

  /** Present only when state === "ready". */
  applicationPackage: ApplicationPackage | null;

  shortlistedAt: ISODateTime;
  preparingStartedAt: ISODateTime | null;
  readyAt: ISODateTime | null;

  /** Whether the user dismissed this opportunity. */
  dismissedByUser: boolean;

  /** Reason given at dismiss time. Optional — never required. */
  dismissReason: DismissReason | null;
}

/**
 * Dismiss reasons: collected for future preference learning.
 * LOCKED: The reason picker improves UX even if the engine doesn't
 * act on it in V1. Collecting the data now, using it post-launch.
 * See POST_LAUNCH.md: "'Not for me' learning."
 */
type DismissReason =
  | "role"
  | "company"
  | "location"
  | "salary"
  | "industry"
  | "other";


// =============================================================================
// APPLICATION TRACKING (POST-PREPARATION)
// =============================================================================

/**
 * LOCKED: Four application statuses — linear pipeline, not Kanban.
 * Ready to apply → Applied → Interview → Offer
 *
 * LOCKED: Declined and Withdrawn are closed outcomes, not pipeline stages.
 * LOCKED: Clicking an external link does NOT auto-mark as Applied.
 *         Requires explicit user confirmation: "Did you apply? → Yes, I applied."
 * LOCKED: "No response" is not a valid status.
 *         Careerely never auto-infers no-response or negative outcomes.
 */
type ApplicationStatus =
  | "ready_to_apply"  // preparation complete; user has not yet applied
  | "applied"         // user explicitly confirmed they applied
  | "interview"       // user manually updated
  | "offer";          // user manually updated

/** Closed outcomes. Not pipeline stages — applied retroactively by the user. */
type ApplicationClosedOutcome = "declined" | "withdrawn";

interface Application {
  id: ID;
  userId: ID;
  opportunityId: ID;
  jobPostingId: ID;

  status: ApplicationStatus;

  /**
   * Set when the user closes the application.
   * LOCKED: Careerely never auto-infers this. User sets it manually.
   */
  closedOutcome: ApplicationClosedOutcome | null;

  /**
   * LOCKED: External link click does NOT set this.
   * Only set when user explicitly confirms: "Yes, I applied."
   */
  appliedAt: ISODateTime | null;

  interviewScheduledAt: ISODateTime | null; // [DERIVED]
  offerReceivedAt: ISODateTime | null;      // [DERIVED]
  closedAt: ISODateTime | null;

  /** Manual notes by the user. [DERIVED] */
  notes: string | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * The status event log.
 * LOCKED: Outcome tracking is manual in V1.
 * LOCKED: Never infer or auto-update status from external signals.
 */
interface ApplicationStatusEvent {
  id: ID;
  applicationId: ID;
  fromStatus: ApplicationStatus | null; // null for the initial creation event
  toStatus: ApplicationStatus | ApplicationClosedOutcome;
  triggeredBy: "user";                  // always user in V1; "system" would require email integration
  occurredAt: ISODateTime;
}


// =============================================================================
// SCAN RUN
// =============================================================================

/**
 * A nightly scan run.
 * [DERIVED] Structure for the scheduled Opportunity Engine execution.
 */
interface ScanRun {
  id: ID;
  userId: ID;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  status: "running" | "completed" | "failed";

  /** How many postings were evaluated at Stage 1. */
  postingsReviewed: number;

  /** How many passed all filters and were shortlisted. */
  shortlisted: number;

  /** How many applications were automatically prepared (max 2 per run). */
  prepared: number;

  /** IDs of opportunities newly shortlisted in this run. */
  newOpportunityIds: ID[];

  /** IDs of opportunities prepared in this run. */
  preparedOpportunityIds: ID[];

  error: string | null;
}


// =============================================================================
// SEARCH (USER-DEFINED HUNT PARAMETERS)
// =============================================================================

/**
 * LOCKED: Searches are missions, not filter configurations.
 * The page answers "What is Careerely hunting for on my behalf?"
 *
 * LOCKED: Career Profile and Search parameters are explicitly separate.
 * "Changes apply to this search only and will not affect your Career Profile."
 *
 * LOCKED: Custom chip input required — user can add their own roles,
 * industries, and locations beyond the preset suggestions.
 */
interface Search {
  id: ID;
  userId: ID;
  name: string | null;      // user-facing label [DERIVED]

  /** Active searches run nightly. Paused searches are preserved but not executed. */
  status: "active" | "paused";

  /**
   * LOCKED: Searches beyond the plan limit are saved as paused.
   * The user must be told this explicitly — never silently downgraded.
   */
  pausedReason: "plan_limit_exceeded" | "user_paused" | null;

  /** Search-specific parameters. Do not affect Career Profile. */
  parameters: SearchParameters;

  /** Aggregate stats for the search card. */
  stats: SearchStats;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface SearchParameters {
  /** Free-form roles. Not limited to preset chips. */
  roles: string[];

  /** Free-form industries. Not limited to preset chips. */
  industries: string[];

  /** Free-form locations. Not limited to preset chips. */
  locations: string[];

  workStyles: WorkStyle[];

  /**
   * Optional compensation floor for this specific search.
   * Independent of the global preference floor.
   */
  minimumCompensation: CompensationPreference | null;
}

/**
 * LOCKED: Search card shows only: active/paused status, parameters,
 * reviewed count, shortlisted count, last scan.
 * No charts, analytics, market insights, or performance scores.
 */
interface SearchStats {
  totalReviewed: number;
  totalShortlisted: number;
  lastScanAt: ISODateTime | null;

  /**
   * LOCKED: Canonical time window is "last 7 days."
   * See PRODUCT_DECISIONS.md open question #2.
   */
  reviewedLast7Days: number;
  shortlistedLast7Days: number;
}


// =============================================================================
// DERIVED ASSUMPTIONS
// =============================================================================
//
// The following decisions were required to make the schema implementable but
// were NOT explicitly specified in the locked product decisions.
// Claude Code should validate these with the product owner before committing
// to implementation details that depend on them.
//
// 1. ID TYPE
//    Assumption: IDs are strings (UUID or Supabase row ID).
//    The spec names Supabase as the database but doesn't specify ID format.
//
// 2. DATETIME TYPE
//    Assumption: All datetimes are ISO 8601 strings for JSON serialization safety.
//    Using string rather than Date to avoid timezone ambiguity across layers.
//
// 3. CAREER GOAL ENUM VALUES
//    Assumption: The CareerGoal enum values are derived from typical onboarding
//    preference categories. The exact enum values were never specified.
//    Needs confirmation against Step 3 onboarding implementation.
//
// 4. SCORE DIMENSION WEIGHTS
//    Assumption: ScoreDimension.weight is a 0–1 float, sum = 1.
//    The weighting model is not specified in the product decisions.
//    Implementation defines the actual weights.
//
// 5. HARD FILTER THRESHOLD
//    Assumption: There is a minimum composite score below which an opportunity
//    is rejected at Stage 3 (score_below_threshold). The exact threshold
//    is implementation-defined.
//
// 6. EVIDENCE CONFIDENCE FIELD
//    Assumption: EvidenceRecord.confidence is a 0–1 float used internally.
//    The product spec requires evidence traceability but doesn't specify
//    a confidence representation.
//
// 7. COVER LETTER SEGMENT TYPES
//    Assumption: Four segment types (opening, fit_argument, goal_alignment, closing).
//    The spec says cover letters must be traceable per-claim; segmentation
//    structure was derived to support the review UI.
//
// 8. RESUME SECTION ENUM
//    Assumption: The listed ResumeSection values cover typical resume structure.
//    Exact section taxonomy not specified in product decisions.
//
// 9. SCAN RUN STRUCTURE
//    Assumption: A ScanRun record is created per nightly execution per user.
//    The spec locks "nightly" as the cadence but doesn't specify the
//    persistence model for scan history.
//
// 10. MANUALLY_REQUESTED PREPARATION
//     Assumption: Users can manually request preparation for an opportunity
//     beyond the nightly top 2. The spec locks "top 2 prepared automatically"
//     but doesn't explicitly prohibit manual requests. Marked [DERIVED].
//     Clarify with product owner.
//
// 11. APPLICATION.NOTES
//     Assumption: Users can add free-form notes to an application.
//     Not specified in locked product decisions.
//
// 12. GENERATION MODEL FIELD
//     Assumption: ApplicationPackage stores the model ID used for generation
//     (e.g. "claude-sonnet-4-6") for auditability. Not specified in product
//     decisions but consistent with evidence traceability invariant.
//
// 13. SEARCH.NAME
//     Assumption: Searches can be given a user-facing name/label.
//     The spec describes searches as "missions" but doesn't specify
//     whether they are named or unnamed.
//
// =============================================================================
