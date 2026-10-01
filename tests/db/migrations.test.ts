import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLAN_LIMITS, PLAN_IDS } from '../../lib/plans'

const root = path.resolve(import.meta.dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')

const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'

let db: PGlite

// Run statements as a signed-in Supabase user (role + JWT subject).
async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`)
  }
}

async function setSubscription(uid: string, plan: string, status: string, periodEndOffset: string) {
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
     values ($1, $2, $3, now() - interval '1 day', now() + $4::interval)
     on conflict (user_id) do update set plan = excluded.plan, status = excluded.status,
       current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end`,
    [uid, plan, status, periodEndOffset],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
  // Simulate a legacy prototype database: a profiles table with a client-writable plan.
  await db.exec(`
    create table public.profiles (id uuid primary key, email text, plan text default 'standard', voice_sample text);
    alter table public.profiles enable row level security;
    create policy legacy_all on public.profiles for all using (true) with check (true);
  `)
  await db.exec(`insert into auth.users (id, email) values ('${BOB}', 'bob@example.com')`)

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }
  // Applying twice must be safe (migrations are idempotent where possible).
  for (const file of files) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }

  await db.exec(`insert into auth.users (id, email, raw_user_meta_data)
    values ('${ALICE}', 'alice@example.com', '{"first_name":"Alice","last_name":"Andersen"}')`)
})

describe('foundation migration', () => {
  it('creates a profile on signup and backfills existing users', async () => {
    const { rows } = await db.query<{ id: string; first_name: string | null }>(
      'select id, first_name from public.profiles order by email',
    )
    expect(rows).toEqual([
      { id: ALICE, first_name: 'Alice' },
      { id: BOB, first_name: null },
    ])
  })

  it('records terms acceptance and a valid pre-selected plan from signup metadata', async () => {
    const carol = '33333333-3333-3333-3333-333333333333'
    const dave = '44444444-4444-4444-4444-444444444444'
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'carol@example.com', '{"terms_accepted":"true","selected_plan":"pro"}'),
      ($2, 'dave@example.com', '{"selected_plan":"premium"}')`, [carol, dave])
    const { rows } = await db.query<{ email: string; accepted: boolean; selected_plan: string | null }>(
      `select email, terms_accepted_at is not null as accepted, selected_plan::text
       from public.profiles where id in ($1, $2) order by email`, [carol, dave])
    expect(rows).toEqual([
      { email: 'carol@example.com', accepted: true, selected_plan: 'pro' },
      { email: 'dave@example.com', accepted: false, selected_plan: null },
    ])
    await db.query('delete from auth.users where id in ($1, $2)', [carol, dave])
  })

  it('keeps resume suggestions and usage events server-written only', async () => {
    await asUser(ALICE, () =>
      db.query(`insert into public.career_profiles (user_id, target_roles) values ($1, '{Sales}')`, [ALICE]),
    )
    await expect(
      asUser(ALICE, () =>
        db.query(`update public.career_profiles set suggestions = '{"roles":["CEO"]}' where user_id = $1`, [ALICE]),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(ALICE, () => db.query(`insert into public.usage_events (user_id, kind) values ($1, 'x')`, [ALICE])),
    ).rejects.toThrow(/permission denied/)
  })

  it('removes legacy policies so users only see their own profile', async () => {
    const rows = await asUser(ALICE, () => db.query('select id from public.profiles'))
    expect(rows.rows).toEqual([{ id: ALICE }])
  })

  it('does not let users write their plan or billing state', async () => {
    await expect(
      asUser(ALICE, () => db.query(`update public.profiles set plan = 'premium' where id = $1`, [ALICE])),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(ALICE, () =>
        db.query(`insert into public.subscriptions (user_id, plan, status) values ($1, 'max', 'active')`, [ALICE]),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('lets users update their own name', async () => {
    await asUser(ALICE, () => db.query(`update public.profiles set first_name = 'Ali' where id = $1`, [ALICE]))
    const { rows } = await db.query('select first_name from public.profiles where id = $1', [ALICE])
    expect(rows).toEqual([{ first_name: 'Ali' }])
  })

  it('keeps plan limits in sync with lib/plans.ts', async () => {
    for (const plan of PLAN_IDS) {
      const { rows } = await db.query<{ active_searches: number | null; monthly_preparations: number }>(
        'select * from public.plan_limits($1)',
        [plan],
      )
      expect(rows[0]).toEqual({
        active_searches: PLAN_LIMITS[plan].activeSearches,
        monthly_preparations: PLAN_LIMITS[plan].monthlyPreparations,
      })
    }
  })

  it('makes accounts without a subscription read-only', async () => {
    await expect(
      asUser(BOB, () =>
        db.query(`insert into public.searches (user_id, name) values ($1, 'Sales in fintech')`, [BOB]),
      ),
    ).rejects.toThrow(/active subscription is required/)
    await expect(
      asUser(BOB, () =>
        db.query(`insert into public.searches (user_id, name, status) values ($1, 'Sales', 'paused')`, [BOB]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('enforces the active search limit and allows saving as paused', async () => {
    await setSubscription(ALICE, 'basic', 'active', '20 days')
    await asUser(ALICE, () =>
      db.query(`insert into public.searches (user_id, name) values ($1, 'First')`, [ALICE]),
    )
    await expect(
      asUser(ALICE, () => db.query(`insert into public.searches (user_id, name) values ($1, 'Second')`, [ALICE])),
    ).rejects.toThrow(/Active search limit reached/)
    await asUser(ALICE, () =>
      db.query(`insert into public.searches (user_id, name, status) values ($1, 'Second', 'paused')`, [ALICE]),
    )
    await expect(
      asUser(ALICE, () => db.query(`update public.searches set status = 'active' where name = 'Second'`)),
    ).rejects.toThrow(/Active search limit reached/)

    await setSubscription(ALICE, 'pro', 'active', '20 days')
    await asUser(ALICE, () => db.query(`update public.searches set status = 'active' where name = 'Second'`))
    const { rows } = await db.query(`select count(*)::int as n from public.searches where status = 'active'`)
    expect(rows).toEqual([{ n: 2 }])
  })

  it('stores a search minimum with its own currency, both or neither (D5)', async () => {
    await asUser(ALICE, () => db.query(`update public.searches set min_compensation = 70000, compensation_currency = 'GBP' where name = 'First'`))
    const { rows } = await db.query(`select min_compensation, compensation_currency from public.searches where name = 'First'`)
    expect(rows).toEqual([{ min_compensation: 70000, compensation_currency: 'GBP' }])
    await expect(asUser(ALICE, () => db.query(`update public.searches set compensation_currency = null where name = 'First'`))).rejects.toThrow(/searches_compensation_pair/)
    await expect(asUser(ALICE, () => db.query(`update public.searches set min_compensation = null where name = 'First'`))).rejects.toThrow(/searches_compensation_pair/)
    await expect(asUser(ALICE, () => db.query(`update public.searches set compensation_currency = 'gbp' where name = 'First'`))).rejects.toThrow(/searches_compensation_currency_format/)
    await expect(
      asUser(ALICE, () => db.query(`insert into public.searches (user_id, name, status, min_compensation) values ($1, 'No currency', 'paused', 50000)`, [ALICE])),
    ).rejects.toThrow(/searches_compensation_pair/)
    await asUser(ALICE, () => db.query(`update public.searches set min_compensation = null, compensation_currency = null where name = 'First'`))
  })

  it('keeps access until the end of a cancelled period, then goes read-only', async () => {
    await setSubscription(ALICE, 'pro', 'canceled', '5 days')
    let { rows } = await db.query('select public.has_active_access($1) as ok', [ALICE])
    expect(rows).toEqual([{ ok: true }])

    await setSubscription(ALICE, 'pro', 'canceled', '-1 day')
    ;({ rows } = await db.query('select public.has_active_access($1) as ok', [ALICE]))
    expect(rows).toEqual([{ ok: false }])

    // Existing data stays readable.
    const visible = await asUser(ALICE, () => db.query('select name from public.searches order by name'))
    expect(visible.rows).toEqual([{ name: 'First' }, { name: 'Second' }])
    await expect(
      asUser(ALICE, () => db.query(`update public.searches set name = 'Renamed'`)),
    ).resolves.toMatchObject({ affectedRows: 0 })
  })

  it('treats unpaid and incomplete subscriptions as read-only', async () => {
    for (const status of ['unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      await setSubscription(ALICE, 'pro', status, '10 days')
      const { rows } = await db.query('select public.has_active_access($1) as ok', [ALICE])
      expect(rows, status).toEqual([{ ok: false }])
    }
  })

  it('does not let users write engine output', async () => {
    await expect(
      asUser(ALICE, () =>
        db.query(
          `insert into public.jobs (source, source_job_id, url, title) values ('x', '1', 'https://x', 'Role')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('lets users dismiss their own opportunities but not change engine fields', async () => {
    await setSubscription(ALICE, 'pro', 'active', '20 days')
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('greenhouse', '42', 'https://x', 'AE') returning id`,
    )
    const opp = await db.query<{ id: string }>(
      `insert into public.opportunities (user_id, job_id, match_score) values ($1, $2, 80) returning id`,
      [ALICE, job.rows[0].id],
    )
    const oppId = opp.rows[0].id

    await asUser(ALICE, () =>
      db.query(`update public.opportunities set dismissed_at = now(), dismiss_reason = 'salary' where id = $1`, [oppId]),
    )
    await expect(
      asUser(ALICE, () => db.query(`update public.opportunities set match_score = 99 where id = $1`, [oppId])),
    ).rejects.toThrow(/permission denied/)

    // Bob cannot see Alice's opportunity or its job.
    const bobView = await asUser(BOB, () => db.query('select id from public.opportunities'))
    expect(bobView.rows).toEqual([])
    const bobJobs = await asUser(BOB, () => db.query('select id from public.jobs'))
    expect(bobJobs.rows).toEqual([])
  })

  it('dismisses only Shortlisted opportunities, allows a later reason, and never restores', async () => {
    await setSubscription(ALICE, 'pro', 'active', '20 days')
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('greenhouse', 'dismiss-1', 'https://x', 'AE') returning id`,
    )
    const insert = async (state: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.opportunities (user_id, job_id, state) values ($1, $2, $3::public.opportunity_state) returning id`,
          [ALICE, job.rows[0].id, state],
        )
      ).rows[0].id
    // One opportunity per (user, job): reuse the job by deleting between cases.
    const preparing = await insert('preparing')
    await expect(
      asUser(ALICE, () => db.query(`update public.opportunities set dismissed_at = now() where id = $1`, [preparing])),
    ).rejects.toThrow(/Only shortlisted opportunities can be dismissed/)
    await db.query(`update public.opportunities set state = 'ready' where id = $1`, [preparing])
    await expect(
      asUser(ALICE, () => db.query(`update public.opportunities set dismissed_at = now() where id = $1`, [preparing])),
    ).rejects.toThrow(/Only shortlisted opportunities can be dismissed/)
    await db.query(`delete from public.opportunities where id = $1`, [preparing])

    const shortlisted = await insert('shortlisted')
    await expect(
      asUser(ALICE, () => db.query(`update public.opportunities set dismiss_reason = 'role' where id = $1`, [shortlisted])),
    ).rejects.toThrow(/only be given for a dismissed opportunity/)
    await asUser(ALICE, () => db.query(`update public.opportunities set dismissed_at = now() where id = $1`, [shortlisted]))
    await asUser(ALICE, () => db.query(`update public.opportunities set dismiss_reason = 'location' where id = $1`, [shortlisted]))
    await expect(
      asUser(ALICE, () => db.query(`update public.opportunities set dismissed_at = null where id = $1`, [shortlisted])),
    ).rejects.toThrow(/cannot be restored/)
    const { rows } = await db.query<{ dismiss_reason: string }>('select dismiss_reason from public.opportunities where id = $1', [shortlisted])
    expect(rows[0].dismiss_reason).toBe('location')
    await db.query(`delete from public.opportunities where id = $1`, [shortlisted])
  })

  it('keeps application status rules: no return to Ready to apply, outcomes only once submitted', async () => {
    await setSubscription(ALICE, 'pro', 'active', '20 days')
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('greenhouse', 'apps-1', 'https://x', 'AE') returning id`,
    )
    const opp = await db.query<{ id: string }>(`insert into public.opportunities (user_id, job_id, state) values ($1, $2, 'ready') returning id`, [ALICE, job.rows[0].id])
    const app = await db.query<{ id: string }>(
      `insert into public.applications (user_id, opportunity_id, job_id, status) values ($1, $2, $3, 'ready_to_apply') returning id`,
      [ALICE, opp.rows[0].id, job.rows[0].id],
    )
    const id = app.rows[0].id
    // The trigger holds for every writer (here the server role).
    const asServer = (sql: string) => db.query(sql, [id])

    await expect(asServer(`update public.applications set outcome = 'declined' where id = $1`)).rejects.toThrow(/Only a submitted application can be closed/)
    await expect(asServer(`update public.applications set status = 'interview' where id = $1`)).rejects.toThrow(/needs its applied date/)
    await asServer(`update public.applications set status = 'applied', applied_at = now() where id = $1`)
    await asServer(`update public.applications set status = 'interview' where id = $1`)
    await asServer(`update public.applications set outcome = 'withdrawn' where id = $1`)
    await asServer(`update public.applications set status = 'offer', outcome = null where id = $1`) // reopen
    await expect(asServer(`update public.applications set status = 'ready_to_apply', outcome = null where id = $1`)).rejects.toThrow(/cannot return to Ready to apply/)
    const { rows } = await db.query<{ status: string; outcome: string | null }>('select status, outcome from public.applications where id = $1', [id])
    expect(rows[0]).toEqual({ status: 'offer', outcome: null })
    // Signed-in users can't change status columns directly (only through the functions below).
    await expect(asUser(ALICE, () => db.query(`update public.applications set status = 'interview' where id = $1`, [id]))).rejects.toThrow(/permission denied/)
    await db.query('delete from public.opportunities where id = $1', [opp.rows[0].id])
  })

  it('writes each application status change and its history event in one transaction (D7)', async () => {
    await setSubscription(ALICE, 'pro', 'active', '20 days')
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('greenhouse', 'apps-tx', 'https://x', 'AE') returning id`,
    )
    const opp = await db.query<{ id: string }>(`insert into public.opportunities (user_id, job_id, state) values ($1, $2, 'ready') returning id`, [ALICE, job.rows[0].id])
    const { rows: created } = await db.query<{ id: string }>(
      `insert into public.applications (user_id, opportunity_id, job_id, status) values ($1, $2, $3, 'ready_to_apply') returning id`,
      [ALICE, opp.rows[0].id, job.rows[0].id],
    )
    const id = created[0].id
    const state = async () => (await db.query<{ status: string; outcome: string | null; applied: boolean }>(`select status::text, outcome::text, applied_at is not null as applied from public.applications where id = $1`, [id])).rows[0]
    const events = async () =>
      (await db.query<{ kind: string; payload: unknown }>(`select kind, payload from public.activity where application_id = $1 order by created_at, kind`, [id])).rows
    const asAlice = (sql: string, params: unknown[] = [id]) => asUser(ALICE, () => db.query(sql, params))

    // If the history event can't be written, the status change doesn't commit.
    await db.exec(`
      create function public.test_fail_activity() returns trigger language plpgsql as $$ begin raise exception 'history write failed'; end; $$;
      create trigger test_fail_activity before insert on public.activity for each row execute function public.test_fail_activity();
    `)
    await expect(asAlice(`select public.mark_application_applied($1)`)).rejects.toThrow(/history write failed/)
    expect(await state()).toEqual({ status: 'ready_to_apply', outcome: null, applied: false })
    expect(await events()).toEqual([])

    // Initial apply: the change and exactly one application_applied event; a repeat records nothing.
    await db.exec(`drop trigger test_fail_activity on public.activity; drop function public.test_fail_activity();`)
    await asAlice(`select public.mark_application_applied($1)`)
    expect(await state()).toEqual({ status: 'applied', outcome: null, applied: true })
    expect(await events()).toEqual([{ kind: 'application_applied', payload: {} }])
    await expect(asAlice(`select public.mark_application_applied($1)`)).rejects.toThrow(/not waiting to be applied to/)
    expect(await events()).toHaveLength(1)

    // Later changes: one event each; choosing the current state records nothing.
    await asAlice(`select public.set_application_status($1, 'interview', null)`)
    await asAlice(`select public.set_application_status($1, 'interview', null)`)
    await asAlice(`select public.set_application_status($1, null, 'withdrawn')`)
    expect(await state()).toEqual({ status: 'interview', outcome: 'withdrawn', applied: true })
    expect((await events()).map(e => e.payload)).toEqual([{}, { status: 'interview', outcome: null }, { status: 'interview', outcome: 'withdrawn' }])

    // A failed history write rolls back a later change too.
    await db.exec(`
      create function public.test_fail_activity() returns trigger language plpgsql as $$ begin raise exception 'history write failed'; end; $$;
      create trigger test_fail_activity before insert on public.activity for each row execute function public.test_fail_activity();
    `)
    await expect(asAlice(`select public.set_application_status($1, 'offer', null)`)).rejects.toThrow(/history write failed/)
    expect(await state()).toEqual({ status: 'interview', outcome: 'withdrawn', applied: true })
    await db.exec(`drop trigger test_fail_activity on public.activity; drop function public.test_fail_activity();`)
    expect(await events()).toHaveLength(3)

    // Own applications only; invalid input and read-only accounts change nothing.
    await expect(asUser(BOB, () => db.query(`select public.set_application_status($1, 'offer', null)`, [id]))).rejects.toThrow(/not found/)
    await expect(asAlice(`select public.set_application_status($1, 'offer', 'declined')`)).rejects.toThrow(/Invalid status change/)
    await setSubscription(ALICE, 'pro', 'canceled', '-1 day')
    await expect(asAlice(`select public.set_application_status($1, 'offer', null)`)).rejects.toThrow(/read-only/)
    expect(await state()).toEqual({ status: 'interview', outcome: 'withdrawn', applied: true })
    expect(await events()).toHaveLength(3)
    await setSubscription(ALICE, 'pro', 'active', '20 days')

    // Only signed-in users may run them; the user always comes from auth.uid().
    for (const fn of ['public.mark_application_applied(uuid)', 'public.set_application_status(uuid,text,text)']) {
      const { rows: grants } = await db.query<{ role: string; ok: boolean }>(
        `select r as role, has_function_privilege(r, $1, 'EXECUTE') as ok from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
        [fn],
      )
      expect(grants, fn).toEqual([
        { role: 'anon', ok: false },
        { role: 'authenticated', ok: true },
        { role: 'service_role', ok: false },
      ])
    }
    await db.query('delete from public.opportunities where id = $1', [opp.rows[0].id])
  })

  it('counts preparations in the current billing period, excluding failures', async () => {
    const { rows: sub } = await db.query<{ current_period_start: Date }>(
      'select current_period_start from public.subscriptions where user_id = $1',
      [ALICE],
    )
    const periodStart = sub[0].current_period_start
    const jobs = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title)
       values ('lever', 'a', 'https://a', 'A'), ('lever', 'b', 'https://b', 'B'), ('lever', 'c', 'https://c', 'C')
       returning id`,
    )
    const statuses = ['ready', 'failed', 'preparing']
    for (let i = 0; i < 3; i++) {
      const opp = await db.query<{ id: string }>(
        `insert into public.opportunities (user_id, job_id) values ($1, $2) returning id`,
        [ALICE, jobs.rows[i].id],
      )
      await db.query(
        `insert into public.application_packages (user_id, opportunity_id, status, quota_period_start)
         values ($1, $2, $3, $4)`,
        [ALICE, opp.rows[0].id, statuses[i], periodStart],
      )
    }
    const { rows } = await db.query('select public.preparations_used($1) as used', [ALICE])
    expect(rows).toEqual([{ used: 2 }])
  })

  it('keeps behavioral signals service-written only (not populated in V1)', async () => {
    await expect(
      asUser(ALICE, () =>
        db.query(`insert into public.behavioral_signals (user_id, kind) values ($1, 'opened')`, [ALICE]),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('stores evidence as confirmed / inferred / unknown only, never agent-confirmed', async () => {
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('ashby', 'ev1', 'https://e', 'Role') returning id`,
    )
    const opp = await db.query<{ id: string }>(
      `insert into public.opportunities (user_id, job_id) values ($1, $2) returning id`,
      [ALICE, job.rows[0].id],
    )
    const insert = (outcome: string, sourceType: string) =>
      db.query(
        `insert into public.evidence (user_id, opportunity_id, job_id, signal_type, source_type, source_text, claim, outcome, confidence)
         values ($1, $2, $3, 'requirement_met', $4, 'quote', 'claim', $5, 0.8)`,
        [ALICE, opp.rows[0].id, job.rows[0].id, sourceType, outcome],
      )
    await insert('confirmed', 'resume_text')
    await insert('inferred', 'agent_inference')
    await insert('unknown', 'job_description')
    await expect(insert('negative', 'resume_text')).rejects.toThrow(/invalid input value for enum/)
    await expect(insert('confirmed', 'agent_inference')).rejects.toThrow(/evidence_inference_not_confirmed/)
  })

  it('claims queue tasks once, with a lease', async () => {
    await db.query(`insert into public.engine_tasks (kind, dedupe_key) values ('sync_source', 'sync:a'), ('sync_source', 'sync:b')`)
    await expect(
      db.query(`insert into public.engine_tasks (kind, dedupe_key) values ('sync_source', 'sync:a')`),
    ).rejects.toThrow(/duplicate key/)
    const first = await db.query<{ dedupe_key: string; attempts: number }>(`select * from public.claim_engine_tasks(1, 60)`)
    const second = await db.query<{ dedupe_key: string }>(`select * from public.claim_engine_tasks(5, 60)`)
    expect(first.rows).toHaveLength(1)
    expect(first.rows[0].attempts).toBe(1)
    expect(second.rows.map(r => r.dedupe_key)).not.toContain(first.rows[0].dedupe_key)
    const third = await db.query(`select * from public.claim_engine_tasks(5, 60)`)
    expect(third.rows).toHaveLength(0)
    await expect(
      asUser(ALICE, () => db.query('select * from public.engine_tasks')),
    ).rejects.toThrow(/permission denied/)
  })

  it('reserves preparations within the plan allowance, in rank order', async () => {
    await setSubscription(ALICE, 'basic', 'active', '20 days')
    const { rows: used } = await db.query<{ used: number }>('select public.preparations_used($1) as used', [ALICE])
    const opps: string[] = []
    for (let i = 0; i < 12; i++) {
      const job = await db.query<{ id: string }>(
        `insert into public.jobs (source, source_job_id, url, title) values ('lever', $1, 'https://q', 'Q') returning id`,
        [`quota-${i}`],
      )
      const opp = await db.query<{ id: string }>(
        `insert into public.opportunities (user_id, job_id) values ($1, $2) returning id`,
        [ALICE, job.rows[0].id],
      )
      opps.push(opp.rows[0].id)
    }
    const r1 = await db.query<{ ids: string[] }>('select public.reserve_preparations($1, $2, 2) as ids', [ALICE, opps])
    expect(r1.rows[0].ids).toEqual(opps.slice(0, 2))
    const { rows: states } = await db.query<{ state: string }>('select state from public.opportunities where id = $1', [opps[0]])
    expect(states[0].state).toBe('preparing')
    // Basic allows 10 per period: whatever was already used plus these never exceeds it.
    const r2 = await db.query<{ ids: string[] }>('select public.reserve_preparations($1, $2, 50) as ids', [ALICE, opps])
    expect(used[0].used + 2 + r2.rows[0].ids.length).toBe(10)
    const r3 = await db.query<{ ids: string[] }>('select public.reserve_preparations($1, $2, 2) as ids', [ALICE, opps])
    expect(r3.rows[0].ids).toEqual([])
    // No subscription → nothing reserved.
    const r4 = await db.query<{ ids: string[] }>('select public.reserve_preparations($1, $2, 2) as ids', [BOB, opps])
    expect(r4.rows[0].ids).toEqual([])
  })

  it('only accepts the schema\'s rejection reasons', async () => {
    const job = await db.query<{ id: string }>(
      `insert into public.jobs (source, source_job_id, url, title) values ('ashby', 'rej1', 'https://r', 'R') returning id`,
    )
    await db.query(
      `insert into public.rejections (user_id, job_id, stage, reason_code, detail) values ($1, $2, 1, 'failed_hard_filter', 'x')`,
      [ALICE, job.rows[0].id],
    )
    await expect(
      db.query(`insert into public.rejections (user_id, job_id, stage, reason_code) values ($1, $2, 1, 'bad_fit')`, [ALICE, job.rows[0].id]),
    ).rejects.toThrow(/rejections_reason_code_check/)
  })

  it('removes user data when the auth user is deleted', async () => {
    await db.query('delete from auth.users where id = $1', [ALICE])
    for (const table of ['profiles', 'subscriptions', 'searches', 'opportunities', 'application_packages', 'career_profiles']) {
      const col = table === 'profiles' ? 'id' : 'user_id'
      const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${col} = $1`, [ALICE])
      expect(rows, table).toEqual([{ n: 0 }])
    }
  })
})

describe('search compensation currency migration (D5)', () => {
  it('keeps existing engine behaviour for existing searches', async () => {
    const fresh = new PGlite()
    await fresh.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
    const target = '20261001180000_search_compensation_currency.sql'
    for (const file of files.filter(f => f < target)) await fresh.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))

    const withCurrency = '55555555-5555-5555-5555-555555555555'
    const without = '66666666-6666-6666-6666-666666666666'
    await fresh.query(`insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [withCurrency, without])
    await fresh.query(`insert into public.career_profiles (user_id, min_compensation, compensation_currency) values ($1, 60000, 'EUR'), ($2, null, null)`, [withCurrency, without])
    await fresh.query(
      `insert into public.searches (user_id, name, status, min_compensation) values
         ($1, 'Applied in EUR', 'paused', 80000), ($1, 'No minimum', 'paused', null), ($2, 'Had no effect', 'paused', 90000)`,
      [withCurrency, without],
    )

    await fresh.exec(readFileSync(path.join(migrationsDir, target), 'utf8'))
    const { rows } = await fresh.query(`select name, min_compensation, compensation_currency from public.searches order by name`)
    expect(rows).toEqual([
      // The engine used the profile currency for this minimum: kept, now explicit.
      { name: 'Applied in EUR', min_compensation: 80000, compensation_currency: 'EUR' },
      // Without any currency the engine ignored the amount: cleared, so nothing changes.
      { name: 'Had no effect', min_compensation: null, compensation_currency: null },
      { name: 'No minimum', min_compensation: null, compensation_currency: null },
    ])
    await fresh.close()
  })
})

describe('plan change: pausing searches above a lower limit (D6)', () => {
  it('keeps provenance separate from the dismissible notice; users cannot set or clear the marker', async () => {
    const pg = new PGlite()
    await pg.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
    for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
    const uid = '88888888-8888-8888-8888-888888888888'
    await pg.query(`insert into auth.users (id, email) values ($1, 'h@example.com')`, [uid])
    const setPlan = (plan: string) =>
      pg.query(
        `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
         values ($1, $2, 'active', now() - interval '1 day', now() + interval '20 days')
         on conflict (user_id) do update set plan = excluded.plan`,
        [uid, plan],
      )
    const asUid = async <T,>(fn: () => Promise<T>) => {
      await pg.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`)
      try {
        return await fn()
      } finally {
        await pg.exec(`reset role; reset request.jwt.claim.sub;`)
      }
    }
    const row = async (name: string) =>
      (await pg.query<{ status: string; marked: boolean }>(`select status::text, paused_by_plan_change_at is not null as marked from public.searches where name = $1`, [name])).rows[0]

    await setPlan('pro')
    await pg.query(
      `insert into public.searches (user_id, name, status, created_at) values
         ($1, 'Kept', 'active', now() - interval '3 days'), ($1, 'Auto', 'active', now() - interval '2 days'), ($1, 'Manual', 'active', now() - interval '1 day')`,
      [uid],
    )
    // Manually paused by the user: never marked.
    await asUid(() => pg.query(`update public.searches set status = 'paused' where name = 'Manual'`))
    expect(await row('Manual')).toEqual({ status: 'paused', marked: false })
    // Users can't set (or clear) the automatic-pause marker themselves.
    await expect(asUid(() => pg.query(`update public.searches set paused_by_plan_change_at = now() where name = 'Manual'`))).rejects.toThrow(/permission denied/)

    await setPlan('basic')
    expect((await pg.query<{ n: number }>(`select public.apply_plan_search_limit($1) as n`, [uid])).rows[0].n).toBe(1)
    expect(await row('Auto')).toEqual({ status: 'paused', marked: true })
    expect(await row('Manual')).toEqual({ status: 'paused', marked: false })
    await expect(asUid(() => pg.query(`update public.searches set paused_by_plan_change_at = null where name = 'Auto'`))).rejects.toThrow(/permission denied/)

    // Dismissing the notice is user-level: no search changes, provenance stays.
    const before = (await pg.query(`select id, status, paused_by_plan_change_at, updated_at from public.searches order by name`)).rows
    await asUid(() => pg.query(`select public.dismiss_plan_change_notice()`))
    expect((await pg.query(`select plan_change_notice_dismissed_at is not null as dismissed from public.profiles where id = $1`, [uid])).rows).toEqual([{ dismissed: true }])
    expect((await pg.query(`select id, status, paused_by_plan_change_at, updated_at from public.searches order by name`)).rows).toEqual(before)
    expect(await row('Auto')).toEqual({ status: 'paused', marked: true })

    // Resuming (within the limit) clears the marker.
    await asUid(() => pg.query(`update public.searches set status = 'paused' where name = 'Kept'`))
    await asUid(() => pg.query(`update public.searches set status = 'active' where name = 'Auto'`))
    expect(await row('Auto')).toEqual({ status: 'active', marked: false })
    await pg.close()
  })

  it('pauses only the excess, keeps the profile search then the oldest, and is idempotent', async () => {
    const pg = new PGlite()
    await pg.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
    for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
    const uid = '77777777-7777-7777-7777-777777777777'
    await pg.query(`insert into auth.users (id, email) values ($1, 'g@example.com')`, [uid])
    const setPlan = (plan: string, status = 'active', end = '20 days') =>
      pg.query(
        `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
         values ($1, $2, $3, now() - interval '1 day', now() + $4::interval)
         on conflict (user_id) do update set plan = excluded.plan, status = excluded.status, current_period_end = excluded.current_period_end`,
        [uid, plan, status, end],
      )
    await setPlan('pro')
    await pg.query(
      `insert into public.searches (user_id, name, status, created_from_profile, created_at) values
         ($1, 'Oldest', 'active', false, now() - interval '5 days'),
         ($1, 'From profile', 'active', true, now() - interval '1 day'),
         ($1, 'Second oldest', 'active', false, now() - interval '4 days'),
         ($1, 'Newest', 'active', false, now() - interval '1 hour'),
         ($1, 'Already paused', 'paused', false, now() - interval '9 days')`,
      [uid],
    )
    const state = async () =>
      (await pg.query<{ name: string; status: string; marked: boolean }>(`select name, status::text, paused_by_plan_change_at is not null as marked from public.searches order by name`)).rows
    const apply = async () => (await pg.query<{ n: number }>(`select public.apply_plan_search_limit($1) as n`, [uid])).rows[0].n

    // Within the limit: nothing changes.
    expect(await apply()).toBe(0)

    // Basic (1): keep the search created from preferences.
    await setPlan('basic')
    expect(await apply()).toBe(3)
    expect(await state()).toEqual([
      { name: 'Already paused', status: 'paused', marked: false },
      { name: 'From profile', status: 'active', marked: false },
      { name: 'Newest', status: 'paused', marked: true },
      { name: 'Oldest', status: 'paused', marked: true },
      { name: 'Second oldest', status: 'paused', marked: true },
    ])
    // Repeated delivery: nothing more is paused, the marks are unchanged.
    const marks = (await pg.query(`select id, paused_by_plan_change_at from public.searches order by id`)).rows
    expect(await apply()).toBe(0)
    expect((await pg.query(`select id, paused_by_plan_change_at from public.searches order by id`)).rows).toEqual(marks)

    // Upgrading never resumes anything automatically.
    await setPlan('max')
    expect(await apply()).toBe(0)
    expect((await state()).filter(s => s.status === 'active').map(s => s.name)).toEqual(['From profile'])

    // Resuming a search clears its mark; the others keep theirs.
    await pg.query(`update public.searches set status = 'active' where name = 'Oldest'`)
    expect((await state()).find(s => s.name === 'Oldest')).toEqual({ name: 'Oldest', status: 'active', marked: false })
    expect((await state()).filter(s => s.marked).map(s => s.name)).toEqual(['Newest', 'Second oldest'])

    // Pro (5) with 2 active: nothing to do. Without a profile search, the oldest are kept.
    await setPlan('pro')
    await pg.query(`update public.searches set created_from_profile = false`)
    await pg.query(`update public.searches set status = 'active' where name in ('Newest', 'Second oldest')`)
    await setPlan('basic')
    expect(await apply()).toBe(3)
    expect((await state()).filter(s => s.status === 'active').map(s => s.name)).toEqual(['Oldest'])

    // Read-only (access ended): nothing is changed.
    await setPlan('pro')
    await pg.query(`update public.searches set status = 'active' where name in ('Newest', 'Second oldest')`)
    await setPlan('basic', 'canceled', '-1 day')
    expect(await apply()).toBe(0)
    expect((await state()).filter(s => s.status === 'active')).toHaveLength(3)

    // Only the service role may run it.
    await pg.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`)
    await expect(pg.query(`select public.apply_plan_search_limit($1)`, [uid])).rejects.toThrow(/permission denied/)
    await pg.exec(`reset role; reset request.jwt.claim.sub;`)
    await pg.close()
  })
})
