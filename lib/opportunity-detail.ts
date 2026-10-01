import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jobMeta } from './display'
import type { WorkStyle } from './engine/schema'

// The opportunity panel's content (Master Brief → Opportunities: per
// opportunity, never generic). Read through the user's session (RLS). Every
// item is a stored record: evidence with its verified quote, requirement
// evaluations, the prepared package. Unknown is shown as "couldn't confirm",
// never as a negative; inferred evidence is labelled as judgment.

export type DetailEvidence = { id: string; claim: string; quote: string; source: 'resume' | 'posting' | 'preferences' | 'judgment'; outcome: 'confirmed' | 'inferred' }

export type OpportunityDetail = {
  id: string
  state: 'shortlisted' | 'preparing' | 'ready'
  matchScore: number | null
  title: string
  company: string
  meta: string[]
  url: string | null
  description: string | null
  evidence: DetailEvidence[]
  considered: string[]
  package: null | {
    status: 'preparing' | 'ready' | 'failed'
    hasChanges: boolean | null
    changes: { changeType: string; text: string; revisedText: string | null }[]
    resumeText: string | null
    coverLetter: string[]
  }
  application: null | { id: string; status: string; outcome: string | null }
}

const SOURCE: Record<string, DetailEvidence['source']> = {
  resume_text: 'resume',
  job_description: 'posting',
  user_preference: 'preferences',
  agent_inference: 'judgment',
}

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

type ResumeChange = { changeType: string; rationale: string; revisedText: string | null; originalText: string | null }
type Segment = { segmentType: string; text: string }
type Requirement = { requirementText: string; outcome: string }

export async function loadOpportunityDetail(supabase: SupabaseClient, id: string): Promise<OpportunityDetail | null> {
  const { data: opp, error } = await supabase
    .from('opportunities')
    .select(
      'id, state, match_score, dismissed_at, goal_aligned, goal_reasoning, requirement_evaluations, primary_evidence_ids, jobs(title, company, location, work_style, salary_min, salary_max, salary_currency, url, description), application_packages(status, has_changes, resume_changes, tailored_resume_text, cover_letter_segments), applications(id, status, outcome)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!opp || opp.dismissed_at) return null
  const job = first(opp.jobs as unknown as (Parameters<typeof jobMeta>[0] & { title: string; company: string | null; url: string | null; description: string | null; work_style: WorkStyle | null }) | null)
  if (!job) return null

  const { data: evidenceRows } = await supabase
    .from('evidence')
    .select('id, claim, source_text, source_type, outcome, confidence')
    .eq('opportunity_id', id)
    .in('outcome', ['confirmed', 'inferred'])
  const primary = (opp.primary_evidence_ids as string[] | null) ?? []
  const evidence = (evidenceRows ?? [])
    .map(e => ({
      id: e.id as string,
      claim: e.claim as string,
      quote: e.source_text as string,
      source: SOURCE[e.source_type as string] ?? 'judgment',
      outcome: e.outcome as 'confirmed' | 'inferred',
      rank: primary.indexOf(e.id as string),
      confidence: Number(e.confidence),
    }))
    // The two primary points first, then confirmed before inferred, then by confidence.
    .sort((a, b) => (a.rank === -1 ? 99 : a.rank) - (b.rank === -1 ? 99 : b.rank) || (a.outcome === b.outcome ? 0 : a.outcome === 'confirmed' ? -1 : 1) || b.confidence - a.confidence)
    .map(e => ({ id: e.id, claim: e.claim, quote: e.quote, source: e.source, outcome: e.outcome }))

  const considered: string[] = []
  for (const r of ((opp.requirement_evaluations as Requirement[] | null) ?? []).filter(r => r.outcome === 'unknown')) {
    considered.push(`I couldn’t confirm this from your resume: “${r.requirementText}”`)
  }
  if (opp.goal_aligned === false && opp.goal_reasoning) considered.push(opp.goal_reasoning as string)

  const pkg = first(opp.application_packages as unknown as { status: 'preparing' | 'ready' | 'failed'; has_changes: boolean | null; resume_changes: ResumeChange[] | null; tailored_resume_text: string | null; cover_letter_segments: Segment[] | null } | null)
  const app = first(opp.applications as unknown as { id: string; status: string; outcome: string | null } | null)

  return {
    id: opp.id,
    state: opp.state,
    matchScore: opp.match_score === null ? null : Math.round(Number(opp.match_score)),
    title: job.title,
    company: job.company ?? '',
    meta: jobMeta(job),
    url: job.url,
    description: job.description,
    evidence,
    considered,
    package: pkg
      ? {
          status: pkg.status,
          hasChanges: pkg.has_changes,
          changes: (pkg.resume_changes ?? []).map(c => ({ changeType: c.changeType, text: c.rationale, revisedText: c.revisedText })),
          resumeText: pkg.status === 'ready' ? pkg.tailored_resume_text : null,
          coverLetter: pkg.status === 'ready' ? (pkg.cover_letter_segments ?? []).map(s => s.text) : [],
        }
      : null,
    application: app,
  }
}
