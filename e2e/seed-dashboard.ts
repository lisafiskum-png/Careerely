import type { SupabaseClient } from '@supabase/supabase-js'

// Test data for the dashboard end-to-end test (local Supabase only): a signed-up
// user who finished onboarding, one search, a completed scan and five
// opportunities in all three states, as the engine would have stored them.

export const PASSWORD = 'correct-horse-1'

type Job = { company: string; title: string; location: string; work_style: 'remote' | 'hybrid' | 'on_site'; salary?: [number, number, string]; description: string }

const JOBS: Job[] = [
  {
    company: 'Stripe',
    title: 'Business Development Lead, Payments',
    location: 'Dublin, Ireland (Hybrid)',
    work_style: 'hybrid',
    salary: [120000, 160000, 'USD'],
    description: 'Grow Stripe’s payments partnerships across Europe.\n\nWhat you’ll need\n• 5+ years in business development or partnerships\n• Experience with AML or financial compliance\n• Fluency in English',
  },
  {
    company: 'Ramp',
    title: 'Strategic Alliance Manager',
    location: 'New York, USA',
    work_style: 'remote',
    salary: [120000, 150000, 'USD'],
    description: 'Build Ramp’s alliances with banks and fintech partners.\n\n• Experience managing partner relationships\n• Background in financial services',
  },
  { company: 'Cohere', title: 'Account Executive, EMEA', location: 'London, UK', work_style: 'hybrid', description: 'Sell Cohere’s platform to enterprises in EMEA.\n\n• Enterprise sales experience' },
  { company: 'Shopify', title: 'Partnerships Manager', location: 'Toronto, Canada', work_style: 'hybrid', description: 'Grow Shopify’s partner ecosystem.\n\n• Partnerships experience' },
  { company: 'Criteo', title: 'Business Development Manager', location: 'Paris, France', work_style: 'hybrid', salary: [90000, 115000, 'EUR'], description: 'Develop new business for Criteo.\n\n• Full-cycle business development' },
]

const RESUME_TEXT = 'Lisa Fiskum\nAML Analyst, Nordic Bank\n• Led due diligence on complex crypto cases\n• Worked with sales on onboarding enterprise clients\nBusiness Development Associate, Fintech Startup\n• Built a pipeline of 40 partner banks'

export async function seedDashboardUser(admin: SupabaseClient, opts: { email: string; firstName: string; readOnly?: boolean }) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: opts.firstName, last_name: 'Fiskum', terms_accepted: 'true' },
  })
  if (error) throw error
  const userId = created.user.id
  const now = Date.now()
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

  await admin.from('profiles').update({ first_name: opts.firstName, last_name: 'Fiskum', onboarding_completed_at: iso(86_400_000) }).eq('id', userId)
  const check = async <T,>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> => {
    const { data, error } = await p
    if (error) throw error
    return data as NonNullable<T>
  }

  await check(
    admin.from('subscriptions').upsert({
      user_id: userId,
      plan: 'pro',
      status: opts.readOnly ? 'canceled' : 'active',
      current_period_start: iso(40 * 86_400_000),
      current_period_end: opts.readOnly ? iso(10 * 86_400_000) : new Date(now + 20 * 86_400_000).toISOString(),
    }),
  )
  await check(
    admin.from('career_profiles').insert({
      user_id: userId,
      resume_text: RESUME_TEXT,
      resume_data: {},
      resume_confirmed_at: iso(86_400_000),
      target_roles: ['Business Development Manager', 'Account Executive'],
      industries: ['Fintech'],
      work_styles: ['hybrid', 'remote'],
      locations: ['Dublin, Ireland', 'London, UK'],
    }),
  )
  // The search is created while the plan is active (RLS-free: service role).
  const search = await check(
    admin
      .from('searches')
      .insert({ user_id: userId, name: 'Business Development Manager', status: opts.readOnly ? 'paused' : 'active', target_roles: ['Business Development Manager', 'Account Executive'], created_from_profile: true })
      .select('id')
      .single(),
  )
  const run = await check(
    admin
      .from('search_runs')
      .insert({ user_id: userId, search_id: search.id, status: 'succeeded', jobs_reviewed: 4393, jobs_rejected: 3021, jobs_deferred: 1361, jobs_shortlisted: 5, started_at: iso(9 * 60_000), finished_at: iso(3 * 60_000) })
      .select('id')
      .single(),
  )

  const tag = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const jobs = await check(
    admin
      .from('jobs')
      .insert(
        JOBS.map((j, i) => ({
          source: 'greenhouse',
          source_job_id: `e2e-${tag}-${i}`,
          url: `https://example.com/jobs/${tag}-${i}`,
          title: j.title,
          company: j.company,
          company_slug: j.company.toLowerCase(),
          location: j.location,
          work_style: j.work_style,
          salary_min: j.salary?.[0] ?? null,
          salary_max: j.salary?.[1] ?? null,
          salary_currency: j.salary?.[2] ?? null,
          description: j.description,
          posted_at: iso((i + 1) * 86_400_000),
          dedupe_key: `e2e-${tag}-${i}`,
        })),
      )
      .select('id, company'),
  )
  const jobId = (company: string) => jobs.find(j => j.company === company)!.id

  const opp = async (company: string, rank: number, state: 'shortlisted' | 'preparing' | 'ready', score: number, aligned: boolean) =>
    check(
      admin
        .from('opportunities')
        .insert({
          user_id: userId,
          job_id: jobId(company),
          search_id: search.id,
          run_id: run.id,
          state,
          rank,
          is_my_pick: rank === 1,
          match_score: score,
          goal_aligned: aligned,
          industry_match: company === 'Stripe',
          matched_target_role: aligned ? 'Business Development Manager' : null,
          goal_reasoning: aligned ? 'Matches your target role “Business Development Manager”.' : 'Doesn’t match one of your target roles, so it ranks below roles that do.',
          reasoning: company === 'Stripe' ? 'I’d start here because your due diligence work on complex crypto cases maps directly to their AML requirement, and your partner pipeline shows the business development side.' : null,
          requirement_evaluations: [
            { requirementText: 'Experience with AML or financial compliance', outcome: 'confirmed', evidenceRecordIds: [], confidence: 0.9, notes: null },
            { requirementText: 'Fluency in English', outcome: 'unknown', evidenceRecordIds: [], confidence: 0, notes: null },
          ],
        })
        .select('id')
        .single(),
    )
  const stripe = await opp('Stripe', 1, 'ready', 86, true)
  const ramp = await opp('Ramp', 2, 'ready', 81, true)
  const cohere = await opp('Cohere', 3, 'preparing', 77, true)
  const shopify = await opp('Shopify', 4, 'shortlisted', 74, true)
  const criteo = await opp('Criteo', 5, 'shortlisted', 72, false)

  const evidenceFor = async (oppId: string, company: string) => {
    const rows = await check(
      admin
        .from('evidence')
        .insert([
          { user_id: userId, opportunity_id: oppId, job_id: jobId(company), signal_type: 'requirement_met', source_type: 'resume_text', source_text: 'Led due diligence on complex crypto cases', claim: 'Your AML due diligence work meets their compliance requirement', outcome: 'confirmed', confidence: 0.9 },
          { user_id: userId, opportunity_id: oppId, job_id: jobId(company), signal_type: 'skills_keyword_match', source_type: 'resume_text', source_text: 'Built a pipeline of 40 partner banks', claim: 'Your partner pipeline shows business development experience', outcome: 'confirmed', confidence: 0.85 },
          { user_id: userId, opportunity_id: oppId, job_id: jobId(company), signal_type: 'seniority_inference', source_type: 'agent_inference', source_text: 'AML Analyst, Nordic Bank', claim: 'Your seniority fits a lead-level role', outcome: 'inferred', confidence: 0.6 },
        ])
        .select('id'),
    )
    await check(admin.from('opportunities').update({ primary_evidence_ids: rows.slice(0, 2).map(r => r.id), reasoning_evidence_ids: rows.slice(0, 2).map(r => r.id) }).eq('id', oppId))
  }
  for (const [o, c] of [
    [stripe, 'Stripe'],
    [ramp, 'Ramp'],
    [cohere, 'Cohere'],
    [shopify, 'Shopify'],
    [criteo, 'Criteo'],
  ] as const)
    await evidenceFor(o.id, c)

  const prepared = async (o: { id: string }, company: string) => {
    const pkg = await check(
      admin
        .from('application_packages')
        .insert({
          user_id: userId,
          opportunity_id: o.id,
          status: 'ready',
          quota_period_start: iso(40 * 86_400_000),
          has_changes: true,
          attempts: 1,
          generation_model: 'claude-sonnet-4-6',
          completed_at: iso(2 * 60_000),
          resume_changes: [
            { section: 'experience_bullet', changeType: 'reworded', originalText: 'Led due diligence on complex crypto cases', revisedText: 'Led due diligence on complex crypto cases, working closely with commercial teams', rationale: 'Brings your commercial exposure forward for a business development role.', evidenceRecordIds: [] },
          ],
          tailored_resume_text: `Lisa Fiskum\n\nAML Analyst, Nordic Bank\n• Led due diligence on complex crypto cases, working closely with commercial teams\n• Worked with sales on onboarding enterprise clients\n\nBusiness Development Associate, Fintech Startup\n• Built a pipeline of 40 partner banks`,
          cover_letter_segments: [
            { segmentType: 'opening', text: `${company}’s work on regulated payments is why I’m writing.`, evidenceRecordIds: [] },
            { segmentType: 'fit_argument', text: 'At Nordic Bank I led due diligence on complex crypto cases, and before that I built a pipeline of 40 partner banks.', evidenceRecordIds: [] },
            { segmentType: 'goal_alignment', text: 'This role is the step into business development I’m aiming for.', evidenceRecordIds: [] },
            { segmentType: 'closing', text: 'I’d welcome the chance to talk.', evidenceRecordIds: [] },
          ],
          cover_letter_text: '',
        })
        .select('id')
        .single(),
    )
    const app = await check(admin.from('applications').insert({ user_id: userId, opportunity_id: o.id, package_id: pkg.id, job_id: jobId(company), status: 'ready_to_apply' }).select('id').single())
    await check(admin.from('activity').insert({ user_id: userId, kind: 'application_prepared', opportunity_id: o.id, application_id: app.id, payload: {}, created_at: iso(2 * 60_000) }))
    return app.id as string
  }
  await check(admin.from('activity').insert({ user_id: userId, kind: 'opportunities_shortlisted', payload: { count: 5, run_id: run.id }, created_at: iso(3 * 60_000) }))
  const stripeApp = await prepared(stripe, 'Stripe')
  const rampApp = await prepared(ramp, 'Ramp')
  await check(admin.from('application_packages').insert({ user_id: userId, opportunity_id: cohere.id, status: 'preparing', quota_period_start: iso(40 * 86_400_000) }))

  return { userId, opportunities: { stripe: stripe.id, ramp: ramp.id, cohere: cohere.id, shopify: shopify.id, criteo: criteo.id }, applications: { stripe: stripeApp, ramp: rampApp } }
}
