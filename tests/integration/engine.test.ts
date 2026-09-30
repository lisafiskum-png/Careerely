import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Runs the Opportunity Engine end to end against the local Supabase stack
// (`npx supabase start`): ingest fixture postings → scan (Stages 1–5) →
// preparation decision (Stage 6) → packages (Stage 7). The Claude API is a
// local mock that also returns untraceable evidence and one invented metric,
// to prove the safeguards hold. Skipped when the local stack isn't running.
//
// Board "acme" adds eight goal-aligned roles so that more than the nightly cap
// (10) pass the threshold, and one role whose evidence is all untraceable.

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const reachable = await fetch(`${SUPABASE_URL}/auth/v1/health`).then(r => r.ok).catch(() => false)

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, `../fixtures/ats/${name}.json`), 'utf8'))

const RESUME = {
  full_name: 'Lisa Fiskum',
  headline: 'AML compliance professional',
  email: 'lisa@example.com',
  phone: '',
  location: 'Oslo, Norway',
  links: [],
  summary: 'AML professional with a business development background.',
  experience: [
    { title: 'AML Analyst', company: 'Nordic Bank', location: 'Oslo', start: '2021', end: '', current: true, highlights: ['Led due diligence on complex crypto cases', 'Worked with sales on onboarding enterprise clients'] },
    { title: 'Business Development Associate', company: 'Fintech Startup', location: 'Oslo', start: '2018', end: '2021', current: false, highlights: ['Built a pipeline of 40 partner banks'] },
  ],
  education: [],
  skills: ['AML', 'KYC'],
  languages: ['English'],
  certifications: [],
}

let packageCalls = 0

const ACME = {
  jobs: [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: 9100 + i,
      title: `Business Development Manager, Region ${i + 1}`,
      absolute_url: `https://boards.greenhouse.io/acme/jobs/${9100 + i}`,
      location: { name: 'London, UK (Hybrid)' },
      first_published: '2026-09-01T10:00:00Z',
      content: '&lt;ul&gt;&lt;li&gt;Experience with AML or financial compliance&lt;/li&gt;&lt;/ul&gt;',
    })),
    {
      id: 9200,
      title: 'Growth Associate',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/9200',
      location: { name: 'London, UK (Hybrid)' },
      first_published: '2026-09-01T10:00:00Z',
      content: '&lt;ul&gt;&lt;li&gt;Curiosity&lt;/li&gt;&lt;/ul&gt;',
    },
  ],
}

function evaluationFor(jobText: string) {
  const title = jobText.match(/^Title: (.*)$/m)?.[1] ?? ''
  const company = jobText.match(/^Company: (.*)$/m)?.[1] ?? ''
  const bullet = jobText.split('\n').find(l => l.startsWith('• '))?.slice(2) ?? title
  const low = /SMB/.test(title)
  const partnerships = /Partnerships/.test(title)
  const s = (n: number) => (low ? 40 : partnerships ? 100 : n)
  if (/Growth Associate/.test(title)) {
    // Every quote is untraceable, so every dimension loses its evidence.
    return {
      evidence: [
        { key: 'e1', signal_type: 'requirement_met', source_type: 'resume_text', source_text: 'Scaled growth experiments to 10 markets', claim: 'You ran growth experiments', outcome: 'confirmed', confidence: 0.9 },
        { key: 'e2', signal_type: 'industry_experience', source_type: 'job_description', source_text: 'Ten years in consumer growth', claim: 'The posting asks for growth experience', outcome: 'confirmed', confidence: 0.8 },
      ],
      requirements: [],
      dimensions: {
        skills_match: { score: 20, evidence_keys: ['e1'] },
        experience_level: { score: 20, evidence_keys: ['e1'] },
        industry_fit: { score: 20, evidence_keys: ['e2'] },
        role_category_fit: { score: 20, evidence_keys: ['e2'] },
      },
      goal: { matched_target_role: '', industry_match: false, evidence_keys: [] },
      reasoning: { text: 'I can’t tell yet.', evidence_keys: [] },
    }
  }
  return {
    evidence: [
      { key: 'e1', signal_type: 'requirement_met', source_type: 'resume_text', source_text: 'Led due diligence on complex crypto cases', claim: 'Your resume shows complex due diligence work', outcome: 'confirmed', confidence: 0.9 },
      { key: 'e2', signal_type: 'industry_experience', source_type: 'job_description', source_text: bullet, claim: 'The posting lists this requirement', outcome: 'confirmed', confidence: 0.8 },
      { key: 'e3', signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Managed a team of 50 analysts', claim: 'You managed a large team', outcome: 'confirmed', confidence: 0.9 },
    ],
    requirements: [
      { requirement_text: bullet, outcome: 'confirmed', evidence_keys: ['e1', 'e2'], confidence: 0.85, notes: 'Your due diligence work covers this.' },
      { requirement_text: 'A PhD in astrophysics', outcome: 'confirmed', evidence_keys: ['e1'], confidence: 0.9, notes: '' },
    ],
    dimensions: {
      skills_match: { score: s(80), evidence_keys: ['e1', 'e3'] },
      experience_level: { score: s(70), evidence_keys: ['e1'] },
      industry_fit: { score: s(75), evidence_keys: ['e2'] },
      role_category_fit: { score: s(90), evidence_keys: ['e2'] },
    },
    goal: {
      matched_target_role: /Business Development/.test(title) ? 'Business Development Manager' : /Account Executive/.test(title) ? 'Account Executive' : '',
      industry_match: company === 'Stripe',
      evidence_keys: ['e2'],
    },
    reasoning: { text: 'I’d start here because your due diligence work maps to what they ask for.', evidence_keys: ['e1', 'e2'] },
  }
}

function packageResponse(retry: boolean) {
  return {
    resume_changes: [
      {
        section: 'experience_bullet',
        change_type: 'reworded',
        original_text: 'Led due diligence on complex crypto cases',
        revised_text: 'Led due diligence on complex crypto cases, working closely with commercial teams',
        rationale: 'Brings your commercial exposure forward for a business development role.',
        evidence_refs: ['E1'],
      },
    ],
    tailored_resume_text: `Lisa Fiskum\nAML Analyst, Nordic Bank\n• Led due diligence on complex crypto cases, working closely with commercial teams\nBusiness Development Associate, Fintech Startup\n• Built a pipeline of 40 partner banks${retry ? '' : '\n• Grew revenue 300%'}`,
    cover_letter: [
      { segment_type: 'opening', text: 'Your team’s work on regulated payments is why I’m writing.', evidence_refs: [] },
      { segment_type: 'fit_argument', text: 'At Nordic Bank I led due diligence on complex crypto cases, and before that I built a pipeline of 40 partner banks.', evidence_refs: ['E1'] },
      { segment_type: 'goal_alignment', text: 'This role is the step into business development I’m aiming for.', evidence_refs: ['E1'] },
      { segment_type: 'closing', text: 'I’d welcome the chance to talk.', evidence_refs: [] },
    ],
  }
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    const request = JSON.parse(body)
    const system = JSON.stringify(request.system)
    const content = typeof request.messages[0].content === 'string' ? request.messages[0].content : JSON.stringify(request.messages[0].content)
    let output
    if (system.includes('You evaluate one job posting')) output = evaluationFor(content)
    else {
      packageCalls++
      output = packageResponse(content.includes('A previous attempt was rejected'))
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: request.model, content: [{ type: 'text', text: JSON.stringify(output) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }))
  })
})

describe.skipIf(!reachable)('Opportunity Engine (local Supabase)', () => {
  let admin: SupabaseClient
  let engine: typeof import('../../lib/engine/queue')
  let ingest: typeof import('../../lib/engine/ingest')
  let userId = ''
  let searchId = ''
  let readOnlyUserId = ''

  beforeAll(async () => {
    await new Promise<void>(r => server.listen(0, r))
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
    process.env.ANTHROPIC_API_KEY = 'test'
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    engine = await import('../../lib/engine/queue')
    ingest = await import('../../lib/engine/ingest')
    admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // Fresh engine state for the fixture postings.
    await admin.from('engine_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await admin.from('jobs').delete().in('company_slug', ['stripe', 'mercury', 'cohere', 'acme'])

    const make = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: 'correct-horse-1', email_confirm: true })
      if (error) throw error
      return data.user.id
    }
    userId = await make(`engine+${Date.now()}@example.com`)
    readOnlyUserId = await make(`engine-ro+${Date.now()}@example.com`)

    for (const id of [userId, readOnlyUserId]) {
      const { error } = await admin.from('career_profiles').insert({
        user_id: id,
        resume_text: 'Lisa Fiskum — AML Analyst at Nordic Bank.',
        resume_data: RESUME,
        resume_confirmed_at: new Date().toISOString(),
        target_roles: ['Business Development Manager', 'Account Executive'],
        industries: ['Fintech'],
        work_styles: ['hybrid', 'remote'],
        locations: ['Dublin, Ireland', 'London, UK', 'Oslo, Norway'],
      })
      if (error) throw error
    }
    await admin.from('subscriptions').insert({
      user_id: userId,
      plan: 'pro',
      status: 'active',
      current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
      current_period_end: new Date(Date.now() + 29 * 86_400_000).toISOString(),
    })
    const search = await admin
      .from('searches')
      .insert({ user_id: userId, name: 'BD', target_roles: ['Business Development Manager', 'Account Executive'], industries: ['Fintech'], work_styles: ['hybrid', 'remote'], locations: ['Dublin, Ireland', 'London, UK', 'Oslo, Norway'], created_from_profile: true })
      .select('id')
      .single()
    if (search.error) throw search.error
    searchId = search.data.id
  })

  afterAll(async () => {
    server.close()
    if (admin) for (const id of [userId, readOnlyUserId]) if (id) await admin.auth.admin.deleteUser(id)
  })

  it('ingests Greenhouse, Lever and Ashby postings and expires removed ones', async () => {
    const fake = (name: string) => (async () => new Response(JSON.stringify(fixture(name)), { status: 200 })) as unknown as typeof fetch
    await ingest.syncBoard(admin, { provider: 'greenhouse', slug: 'stripe', company: 'Stripe' }, fake('greenhouse'))
    await ingest.syncBoard(admin, { provider: 'lever', slug: 'mercury', company: 'Mercury' }, fake('lever'))
    const first = await ingest.syncBoard(admin, { provider: 'ashby', slug: 'cohere', company: 'Cohere' }, fake('ashby'))
    expect(first.fetched).toBe(2)

    // A posting that disappears from the board becomes inactive.
    const without = { ...fixture('ashby'), jobs: fixture('ashby').jobs.filter((j: { id: string }) => j.id !== 'ab-1') }
    const second = await ingest.syncBoard(admin, { provider: 'ashby', slug: 'cohere', company: 'Cohere' }, (async () => new Response(JSON.stringify(without))) as unknown as typeof fetch)
    expect(second.deactivated).toBe(1)
    await ingest.syncBoard(admin, { provider: 'ashby', slug: 'cohere', company: 'Cohere' }, fake('ashby'))
    const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).in('company_slug', ['stripe', 'mercury', 'cohere']).eq('is_active', true)
    expect(count).toBe(6)

    const acme = await ingest.syncBoard(admin, { provider: 'greenhouse', slug: 'acme', company: 'Acme' }, (async () => new Response(JSON.stringify(ACME))) as unknown as typeof fetch)
    expect(acme.fetched).toBe(9)
  })

  it('runs Stages 1–7 for a paying user', async () => {
    await engine.enqueueFirstScan(admin, userId, searchId)
    for (let i = 0; i < 30; i++) {
      const r = await engine.runWorker(admin, { budgetMs: 20_000 })
      if (!r.processed && !r.failed) break
    }

    const { data: run } = await admin.from('search_runs').select('*').eq('search_id', searchId).single()
    expect(run).toMatchObject({ status: 'succeeded', jobs_reviewed: 15, jobs_rejected: 3, jobs_shortlisted: 10, jobs_not_selected: 1, jobs_unevaluable: 1, jobs_prepared: 2 })

    // Stage 1 + Stage 3 rejections are logged with reasons, never silently dropped.
    // Only real rejections: not the over-cap role, not the unevaluable one.
    const { data: rejections } = await admin.from('rejections').select('reason_code, stage, detail, jobs(title)').eq('search_id', searchId)
    const byTitle = Object.fromEntries((rejections ?? []).map(r => [(r.jobs as unknown as { title: string }).title, r]))
    expect(byTitle['Staff Software Engineer']).toMatchObject({ reason_code: 'failed_hard_filter', stage: 1 })
    expect(byTitle['Office Manager']).toMatchObject({ reason_code: 'failed_hard_filter', stage: 1 })
    expect(byTitle['Account Manager, SMB']).toMatchObject({ reason_code: 'score_below_threshold', stage: 3 })
    expect(rejections).toHaveLength(3)

    // Over the nightly cap: Partnerships Manager scored 100 (above the threshold)
    // but is non-aligned, so it ranked 11th. Eligible, not rejected.
    // Insufficient evidence: Growth Associate has no score and no rejection.
    const { data: outcomes } = await admin
      .from('candidate_evaluations')
      .select('status, reason, evaluated_at, jobs(title)')
      .eq('search_id', searchId)
      .in('status', ['not_selected', 'unevaluable'])
    const outcomeByTitle = Object.fromEntries((outcomes ?? []).map(o => [(o.jobs as unknown as { title: string }).title, o]))
    expect(outcomes).toHaveLength(2)
    expect(outcomeByTitle['Partnerships Manager'].status).toBe('not_selected')
    expect(outcomeByTitle['Partnerships Manager'].reason).toMatch(/^Eligible: match score 100 meets the shortlist threshold of 60, but ranked 11 .*outside the top 10/)
    expect(outcomeByTitle['Growth Associate'].status).toBe('unevaluable')
    expect(outcomeByTitle['Growth Associate'].reason).toMatch(/^Not enough traceable evidence .*0 of the 2 .*Fit is unknown, not low\.$/)
    expect(outcomeByTitle['Growth Associate'].reason).not.toMatch(/\bscore of\b|\bscored\b/)
    expect(byTitle['Partnerships Manager']).toBeUndefined()
    expect(byTitle['Growth Associate']).toBeUndefined()

    // Stage 4: goal-aligned roles fill the shortlist; within them, industry match, then score, then recency.
    const { data: opps } = await admin
      .from('opportunities')
      .select('id, rank, is_my_pick, state, match_score, goal_aligned, industry_match, primary_evidence_ids, reasoning, reasoning_evidence_ids, requirement_evaluations, preparation_decision, jobs(title)')
      .eq('user_id', userId)
      .order('rank')
    const titles = (opps ?? []).map(o => (o.jobs as unknown as { title: string }).title)
    expect(titles).toHaveLength(10)
    expect(titles.slice(0, 2)).toEqual(['Business Development Lead, Payments', 'Account Executive, EMEA'])
    expect(titles).not.toContain('Partnerships Manager')
    expect(titles).not.toContain('Growth Associate')
    expect(opps!.every(o => o.goal_aligned)).toBe(true)
    expect(opps![0].is_my_pick).toBe(true)
    expect(opps!.filter(o => o.is_my_pick)).toHaveLength(1)

    // Stages 6–7: top 2 prepared and Ready; the rest stay Shortlisted with a recorded decision.
    expect(opps!.map(o => o.state)).toEqual(['ready', 'ready', ...Array(8).fill('shortlisted')])
    for (const o of opps!.slice(2)) expect(o.preparation_decision).toMatchObject({ selectedForPreparation: false })
    expect(opps![0].preparation_decision).toMatchObject({ selectedForPreparation: true, selectionRank: 1, reason: 'top_ranked_auto' })

    // Stage 5: every stored claim traces to a verified quote; the fabricated one was never stored.
    const { data: evidence } = await admin.from('evidence').select('id, opportunity_id, source_type, source_text, outcome').eq('user_id', userId)
    expect(evidence!.some(e => e.source_text.includes('Managed a team of 50'))).toBe(false)
    expect(evidence!.every(e => ['confirmed', 'inferred', 'unknown'].includes(e.outcome))).toBe(true)
    const evidenceIds = new Set(evidence!.map(e => e.id))
    for (const o of opps!) {
      expect(o.primary_evidence_ids.length).toBeLessThanOrEqual(2)
      expect(o.reasoning).toMatch(/^I/)
      for (const id of [...o.primary_evidence_ids, ...o.reasoning_evidence_ids]) expect(evidenceIds.has(id)).toBe(true)
      for (const r of o.requirement_evaluations as { requirementText: string; outcome: string; evidenceRecordIds: string[] }[]) {
        expect(r.requirementText).not.toContain('astrophysics')
        if (r.outcome !== 'unknown') expect(r.evidenceRecordIds.length).toBeGreaterThan(0)
        for (const id of r.evidenceRecordIds) expect(evidenceIds.has(id)).toBe(true)
      }
    }

    // Packages: the first draft invented "300%", was rejected and regenerated.
    const { data: packages } = await admin.from('application_packages').select('status, attempts, tailored_resume_text, cover_letter_segments, resume_changes, generation_model').eq('user_id', userId)
    expect(packages).toHaveLength(2)
    for (const p of packages!) {
      expect(p).toMatchObject({ status: 'ready', attempts: 2, generation_model: 'claude-sonnet-4-6' })
      expect(p.tailored_resume_text).not.toContain('300%')
      expect((p.cover_letter_segments as { segmentType: string }[]).map(s => s.segmentType)).toEqual(['opening', 'fit_argument', 'goal_alignment', 'closing'])
      expect((p.resume_changes as unknown[]).length).toBe(1)
    }
    expect(packageCalls).toBe(4)

    const { data: apps } = await admin.from('applications').select('status').eq('user_id', userId)
    expect(apps!.map(a => a.status)).toEqual(['ready_to_apply', 'ready_to_apply'])
    const { data: used } = await admin.rpc('preparations_used', { uid: userId })
    expect(used).toBe(2)
  })

  it('lets an over-cap role compete again and skips an unevaluable role until its inputs change', async () => {
    const { count: before } = await admin.from('rejections').select('id', { count: 'exact', head: true }).eq('search_id', searchId)
    await admin.from('engine_tasks').insert({ kind: 'scan_search', user_id: userId, search_id: searchId, payload: { phase: 'start', trigger: 'nightly', day: 'second-scan' } })
    for (let i = 0; i < 30; i++) {
      const r = await engine.runWorker(admin, { budgetMs: 20_000 })
      if (!r.processed && !r.failed) break
    }

    const { data: runs } = await admin.from('search_runs').select('*').eq('search_id', searchId).order('started_at')
    // Only Partnerships Manager is looked at again: rejected and shortlisted roles
    // are done, and Growth Associate's resume, search and posting haven't changed.
    expect(runs![1]).toMatchObject({ status: 'succeeded', jobs_reviewed: 1, jobs_shortlisted: 1, jobs_not_selected: 0, jobs_unevaluable: 0 })

    const { data: opp } = await admin.from('opportunities').select('match_score, goal_aligned, jobs!inner(title)').eq('user_id', userId).eq('jobs.title', 'Partnerships Manager').single()
    expect(opp).toMatchObject({ match_score: 100, goal_aligned: false })

    const { data: remaining } = await admin.from('candidate_evaluations').select('status, jobs(title)').eq('search_id', searchId)
    expect(remaining!.map(r => [(r.jobs as unknown as { title: string }).title, r.status])).toEqual([['Growth Associate', 'unevaluable']])
    const { count: after } = await admin.from('rejections').select('id', { count: 'exact', head: true }).eq('search_id', searchId)
    expect(after).toBe(before)

    // Once the search changes, the unevaluable role is evaluated again.
    await admin.from('searches').update({ industries: ['Fintech', 'Payments'] }).eq('id', searchId)
    await admin.from('engine_tasks').insert({ kind: 'scan_search', user_id: userId, search_id: searchId, payload: { phase: 'start', trigger: 'nightly', day: 'third-scan' } })
    for (let i = 0; i < 30; i++) {
      const r = await engine.runWorker(admin, { budgetMs: 20_000 })
      if (!r.processed && !r.failed) break
    }
    const { data: third } = await admin.from('search_runs').select('*').eq('search_id', searchId).order('started_at')
    expect(third![2]).toMatchObject({ status: 'succeeded', jobs_reviewed: 1, jobs_rejected: 0, jobs_shortlisted: 0, jobs_unevaluable: 1 })
    const { data: latest } = await admin.from('candidate_evaluations').select('run_id, status').eq('search_id', searchId)
    expect(latest).toEqual([{ run_id: third![2].id, status: 'unevaluable' }])
  })

  it('does not search or prepare for accounts without an active subscription', async () => {
    const { data: search } = await admin
      .from('searches')
      .insert({ user_id: readOnlyUserId, name: 'x', status: 'paused', target_roles: ['Account Executive'] })
      .select('id')
      .single()
    // Force-activate as the service role to simulate a lapsed subscription on an active search.
    await admin.from('engine_tasks').insert({ kind: 'scan_search', user_id: readOnlyUserId, search_id: search!.id, payload: { phase: 'start', trigger: 'nightly' } })
    await engine.runWorker(admin, { budgetMs: 10_000 })
    const { count } = await admin.from('search_runs').select('id', { count: 'exact', head: true }).eq('user_id', readOnlyUserId)
    expect(count).toBe(0)
  })
})
