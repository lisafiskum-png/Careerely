import { describe, expect, it } from 'vitest'
import { hardFilter, relevance, roleFamilies, type CandidateJob, type Preferences } from '../../lib/engine/filter'
import { alignmentScore, compositeScore, rankOpportunities, SHORTLIST_MAX_PER_NIGHT, SHORTLIST_MIN_SCORE } from '../../lib/engine/scoring'
import { fallbackReasoning, goalEvidence, primaryEvidence, verifyEvaluation, type RawEvaluation, type Sources } from '../../lib/engine/verify'
import { validatePackage } from '../../lib/engine/prepare'

const prefs: Preferences = {
  roles: ['Business Development Manager', 'Account Executive'],
  industries: ['Fintech'],
  workStyles: ['hybrid', 'remote'],
  locations: ['Oslo, Norway', 'London, UK', 'Remote (Europe)'],
  minCompensation: { amount: 80000, currency: 'EUR' },
}

const job = (over: Partial<CandidateJob>): CandidateJob => ({
  id: 'j', title: 'Business Development Lead', company: 'Stripe', location: 'London, UK', work_style: 'hybrid',
  salary_max: null, salary_currency: null, is_active: true, dedupe_key: 'k', ...over,
})

describe('Stage 1 — hard eligibility filter', () => {
  it('passes a clear match', () => {
    expect(hardFilter(job({}), prefs, new Set()).passed).toBe(true)
  })

  it('rejects expired and duplicate postings with a logged reason', () => {
    const r = hardFilter(job({ is_active: false }), prefs, new Set(['k']))
    expect(r.passed).toBe(false)
    expect(r.failedCriteria.map(c => c.criterion)).toEqual(['expired_posting', 'duplicate_posting'])
    expect(r.failedCriteria.every(c => c.reason.length > 10)).toBe(true)
  })

  it('rejects on-site/hybrid roles for remote-only users', () => {
    const remoteOnly = { ...prefs, workStyles: ['remote' as const] }
    expect(hardFilter(job({ work_style: 'on_site' }), remoteOnly, new Set()).failedCriteria[0].criterion).toBe('location_mismatch')
    // Unknown work style is not a reason to reject.
    expect(hardFilter(job({ work_style: null }), remoteOnly, new Set()).passed).toBe(true)
  })

  it('rejects on-site roles outside the preferred locations, but not unknown ones', () => {
    expect(hardFilter(job({ location: 'New York, USA', work_style: 'on_site' }), prefs, new Set()).failedCriteria[0].criterion).toBe('location_mismatch')
    expect(hardFilter(job({ location: 'New York, USA', work_style: null }), prefs, new Set()).passed).toBe(true)
    expect(hardFilter(job({ location: null, work_style: 'on_site' }), prefs, new Set()).passed).toBe(true)
  })

  it('applies the compensation floor only when both sides are known in the same currency', () => {
    expect(hardFilter(job({ salary_max: 60000, salary_currency: 'EUR' }), prefs, new Set()).failedCriteria[0].criterion).toBe('compensation_below_floor')
    expect(hardFilter(job({ salary_max: 60000, salary_currency: 'GBP' }), prefs, new Set()).passed).toBe(true)
    expect(hardFilter(job({ salary_max: null }), prefs, new Set()).passed).toBe(true)
  })

  it('rejects roles from a different category, keeps compatible and unknown ones', () => {
    expect(hardFilter(job({ title: 'Staff Software Engineer' }), prefs, new Set()).failedCriteria[0].criterion).toBe('role_category_mismatch')
    expect(hardFilter(job({ title: 'Solutions Engineer' }), prefs, new Set()).passed).toBe(true)
    expect(hardFilter(job({ title: 'Customer Success Manager' }), prefs, new Set()).passed).toBe(true)
    expect(hardFilter(job({ title: 'Wizard of Delight' }), prefs, new Set()).passed).toBe(true)
    expect([...roleFamilies('Sales Engineer')]).toEqual(['sales_bd'])
  })

  it('ranks closer titles higher for tonight’s evaluation budget', () => {
    expect(relevance(job({ title: 'Business Development Manager' }), prefs)).toBeGreaterThan(relevance(job({ title: 'Revenue Operations Lead' }), prefs))
  })
})

describe('Stage 3 — composite score', () => {
  it('leaves out dimensions without evidence instead of scoring them low', () => {
    const withGap = compositeScore([
      { dimension: 'skills_match', score: 80, evidenceRecordIds: ['e1'] },
      { dimension: 'experience_level', score: 80, evidenceRecordIds: ['e2'] },
      { dimension: 'industry_fit', score: 0, evidenceRecordIds: [] }, // unknown
    ])
    expect(withGap.matchScore).toBe(80)
    expect(withGap.dimensions.map(d => d.dimension)).toEqual(['skills_match', 'experience_level'])
    expect(withGap.dimensions.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 2)
  })

  it('returns no score without enough evidence', () => {
    expect(compositeScore([{ dimension: 'skills_match', score: 90, evidenceRecordIds: ['e1'] }]).matchScore).toBeNull()
  })

  it('uses the agreed shortlist settings', () => {
    expect(SHORTLIST_MIN_SCORE).toBe(60)
    expect(SHORTLIST_MAX_PER_NIGHT).toBe(10)
  })
})

describe('Stage 4 — goal-alignment-gated ranking', () => {
  it('never ranks a non-aligned role above an aligned one, whatever the score', () => {
    const ranked = rankOpportunities([
      { id: 'high-not-aligned', goalAligned: false, industryMatch: true, matchScore: 98 },
      { id: 'low-aligned', goalAligned: true, industryMatch: false, matchScore: 61 },
      { id: 'aligned-industry', goalAligned: true, industryMatch: true, matchScore: 62 },
      { id: 'aligned-better', goalAligned: true, industryMatch: false, matchScore: 80 },
    ])
    expect(ranked.map(r => r.id)).toEqual(['aligned-industry', 'aligned-better', 'low-aligned', 'high-not-aligned'])
    expect(ranked.map(r => r.finalRank)).toEqual([1, 2, 3, 4])
  })

  it('keeps alignment tiers separate in the tie-break score', () => {
    expect(alignmentScore(true, false)).toBeGreaterThan(alignmentScore(false, true))
  })
})

const sources: Sources = {
  resume: 'Lisa Fiskum\nAML Analyst at Nordic Bank\n• Led due diligence on complex crypto cases\n• Built a pipeline of 40 partner banks',
  job: 'Title: Business Development Lead\nCompany: Stripe\nLocation: London, UK\n\n• 5+ years in business development\n• Experience with AML or financial compliance',
  preferences: 'Target roles: Business Development Manager; Account Executive\nTarget industries: Fintech',
  targetRoles: ['Business Development Manager', 'Account Executive'],
  jobTitle: 'Business Development Lead',
}

const raw: RawEvaluation = {
  evidence: [
    { key: 'e1', signal_type: 'requirement_met', source_type: 'resume_text', source_text: 'Led due diligence on complex crypto cases', claim: 'Your resume shows complex due diligence work', outcome: 'confirmed', confidence: 0.9 },
    { key: 'e2', signal_type: 'industry_experience', source_type: 'job_description', source_text: 'Experience with AML or financial compliance', claim: 'The role asks for AML experience', outcome: 'confirmed', confidence: 0.8 },
    { key: 'e3', signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Managed a team of 50 analysts', claim: 'You managed 50 analysts', outcome: 'confirmed', confidence: 0.9 },
    { key: 'e4', signal_type: 'seniority_inference', source_type: 'agent_inference', source_text: 'AML Analyst at Nordic Bank', claim: 'Your seniority fits a lead role', outcome: 'confirmed', confidence: 0.6 },
    { key: 'e5', signal_type: 'experience_duration', source_type: 'resume_text', source_text: 'Built a pipeline of 40 partner banks', claim: 'You grew revenue by 300%', outcome: 'confirmed', confidence: 0.9 },
  ],
  requirements: [
    { requirement_text: 'Experience with AML or financial compliance', outcome: 'confirmed', evidence_keys: ['e1', 'e2'], confidence: 0.9, notes: 'Directly shown.' },
    { requirement_text: '5+ years in business development', outcome: 'confirmed', evidence_keys: ['e3'], confidence: 0.8, notes: '' },
    { requirement_text: 'A PhD in physics', outcome: 'confirmed', evidence_keys: ['e1'], confidence: 0.9, notes: '' },
  ],
  dimensions: {
    skills_match: { score: 82, evidence_keys: ['e1', 'e3'] },
    experience_level: { score: 70, evidence_keys: ['e4'] },
    industry_fit: { score: 75, evidence_keys: ['e2'] },
    role_category_fit: { score: 90, evidence_keys: ['e3'] },
  },
  goal: { matched_target_role: 'business development manager', industry_match: true, evidence_keys: ['e2'] },
  reasoning: { text: 'I’d start here because your due diligence work maps to their AML requirement.', evidence_keys: ['e1', 'e2'] },
}

describe('Stages 2 & 5 — evidence verification', () => {
  const v = verifyEvaluation(raw, sources)

  it('keeps only evidence whose quote is in the named source and whose numbers are supported', () => {
    expect(v.evidence.map(e => e.key)).toEqual(['e1', 'e2', 'e4'])
    expect(v.dropped.map(d => d.key)).toEqual(['e3', 'e5'])
  })

  it('never marks agent inference as confirmed', () => {
    expect(v.evidence.find(e => e.key === 'e4')!.outcome).toBe('inferred')
  })

  it('turns requirements without traceable evidence into unknown, and drops invented requirements', () => {
    expect(v.requirements).toEqual([
      expect.objectContaining({ requirementText: 'Experience with AML or financial compliance', outcome: 'confirmed', evidenceKeys: ['e1', 'e2'] }),
      expect.objectContaining({ requirementText: '5+ years in business development', outcome: 'unknown', confidence: 0 }),
    ])
    expect(v.requirements.some(r => r.outcome === ('negative' as never))).toBe(false)
  })

  it('drops dimensions whose only evidence was unverifiable', () => {
    expect(v.dimensions.map(d => d.dimension)).toEqual(['skills_match', 'experience_level', 'industry_fit'])
  })

  it('drops sub-word and stitched quotes, leaving those findings unknown rather than negative', () => {
    const stitched = verifyEvaluation(
      {
        ...raw,
        evidence: [
          { key: 's1', signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Analyst', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 's2', signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Nordic', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 'w1', signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Nord', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 'w2', signal_type: 'requirement_met', source_type: 'resume_text', source_text: 'crypto cases Built a pipeline', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 'w3', signal_type: 'industry_experience', source_type: 'job_description', source_text: 'business development Experience with AML', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 'w4', signal_type: 'seniority_inference', source_type: 'agent_inference', source_text: 'Stripe Location: London', claim: 'x', outcome: 'inferred', confidence: 0.9 },
        ],
        requirements: [
          { requirement_text: 'business development • Experience with AML', outcome: 'confirmed', evidence_keys: ['s1'], confidence: 0.9, notes: '' },
          { requirement_text: 'Experience with AML or financial compliance', outcome: 'confirmed', evidence_keys: ['w2', 'w3'], confidence: 0.9, notes: '' },
        ],
        dimensions: {
          skills_match: { score: 10, evidence_keys: ['w1'] },
          experience_level: { score: 10, evidence_keys: ['w2'] },
          industry_fit: { score: 10, evidence_keys: ['w3'] },
          role_category_fit: { score: 10, evidence_keys: ['w4'] },
        },
      },
      sources,
    )
    expect(stitched.evidence.map(e => e.key)).toEqual(['s1', 's2'])
    expect(stitched.dropped.map(d => d.key)).toEqual(['w1', 'w2', 'w3', 'w4'])
    // The stitched requirement is not a requirement of the posting; the real one is unknown, not failed.
    expect(stitched.requirements).toEqual([expect.objectContaining({ requirementText: 'Experience with AML or financial compliance', outcome: 'unknown', confidence: 0 })])
    // Low scores resting on untraceable evidence are not kept: no dimension, no composite score (unknown fit).
    expect(stitched.dimensions).toEqual([])
    expect(compositeScore(stitched.dimensions.map(d => ({ dimension: d.dimension, score: d.score, evidenceRecordIds: d.evidenceKeys }))).matchScore).toBeNull()
  })

  it('never confirms agent inference, whichever source it quotes', () => {
    const v2 = verifyEvaluation(
      {
        ...raw,
        evidence: [
          { key: 'i1', signal_type: 'seniority_inference', source_type: 'agent_inference', source_text: '5+ years in business development', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
          { key: 'i2', signal_type: 'seniority_inference', source_type: 'agent_inference', source_text: 'AML Analyst at Nordic Bank', claim: 'x', outcome: 'confirmed', confidence: 0.9 },
        ],
      },
      sources,
    )
    expect(v2.evidence.map(e => [e.key, e.outcome])).toEqual([['i1', 'inferred'], ['i2', 'inferred']])
  })

  it('only accepts one of the user’s own target roles as goal alignment', () => {
    expect(v.goal).toMatchObject({ matchedTargetRole: 'Business Development Manager', aligned: true, industryMatch: true })
    const other = verifyEvaluation({ ...raw, goal: { matched_target_role: 'Chief Wizard', industry_match: false, evidence_keys: [] } }, sources)
    expect(other.goal.aligned).toBe(false)
  })

  it('replaces untraceable reasoning with one built from verified claims', () => {
    const bad = verifyEvaluation({ ...raw, reasoning: { text: 'I’d start here: you closed 12 deals.', evidence_keys: ['e1'] } }, sources)
    expect(bad.reasoning.text).toBe('I shortlisted this because your resume shows complex due diligence work, and the role asks for AML experience.')
    expect(fallbackReasoning([]).text).toBe('')
  })

  it('builds goal evidence from facts: exact title match confirmed, comparable role inferred', () => {
    expect(goalEvidence('Account Executive', 'Senior Account Executive, EMEA')).toMatchObject({ outcome: 'confirmed', source_type: 'user_preference' })
    expect(goalEvidence('Business Development Manager', 'Partnerships Lead')).toMatchObject({ outcome: 'inferred', source_type: 'agent_inference' })
  })

  it('shows at most two primary evidence points (LOCKED)', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ outcome: 'confirmed' as const, confidence: i / 10, signal_type: 'requirement_met' as const }))
    expect(primaryEvidence(many)).toHaveLength(2)
  })
})

describe('Stage 7 — package validation', () => {
  const ctx = {
    resumeCorpus: sources.resume,
    resume: {
      full_name: 'Lisa Fiskum', headline: '', email: '', phone: '', location: '', links: [], summary: '',
      experience: [{ title: 'AML Analyst', company: 'Nordic Bank', location: '', start: '2021', end: '', current: true, highlights: [] }],
      education: [], skills: [], languages: [], certifications: [],
    },
  }
  const refs = new Map([['E1', 'uuid-1']])
  const good = {
    resume_changes: [
      { section: 'experience_bullet', change_type: 'reworded', original_text: 'Led due diligence on complex crypto cases', revised_text: 'Led due diligence on complex crypto cases for enterprise clients', rationale: 'Mirrors the role’s compliance focus.', evidence_refs: ['E1'] },
      { section: 'experience_bullet', change_type: 'reworded', original_text: 'Ran the sales team', revised_text: 'Ran sales', rationale: 'x', evidence_refs: [] },
    ],
    tailored_resume_text: 'Lisa Fiskum\nAML Analyst, Nordic Bank\n• Led due diligence on complex crypto cases for enterprise clients',
    cover_letter: [
      { segment_type: 'opening', text: 'Stripe’s work on payments caught my attention.', evidence_refs: [] },
      { segment_type: 'fit_argument', text: 'At Nordic Bank I led due diligence on complex crypto cases.', evidence_refs: ['E1'] },
      { segment_type: 'goal_alignment', text: 'This role is the move into business development I’m looking for.', evidence_refs: ['E1'] },
      { segment_type: 'closing', text: 'I’d welcome a conversation.', evidence_refs: [] },
    ],
  }

  it('accepts a grounded package and drops changes that don’t quote the resume', () => {
    const r = validatePackage(good, ctx, sources.job, refs)
    expect(r.problems).toEqual([])
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0]).toMatchObject({ changeType: 'reworded', evidenceRecordIds: ['uuid-1'] })
    expect(r.segments.map(s => s.segmentType)).toEqual(['opening', 'fit_argument', 'goal_alignment', 'closing'])
  })

  it('rejects invented metrics, dropped employers and uncited fit claims', () => {
    const r = validatePackage(
      {
        ...good,
        tailored_resume_text: 'Lisa Fiskum\nGrew revenue 300%',
        cover_letter: good.cover_letter.map(s => (s.segment_type === 'fit_argument' ? { ...s, evidence_refs: [] } : s)),
      },
      ctx,
      sources.job,
      refs,
    )
    expect(r.problems).toEqual([
      'tailored resume has unsupported numbers: 300%',
      'tailored resume dropped employers: Nordic Bank',
      'cover letter fit_argument cites no evidence',
    ])
  })
})
