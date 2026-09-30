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

  it('removes user data when the auth user is deleted', async () => {
    await db.query('delete from auth.users where id = $1', [ALICE])
    for (const table of ['profiles', 'subscriptions', 'searches', 'opportunities', 'application_packages']) {
      const col = table === 'profiles' ? 'id' : 'user_id'
      const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${col} = $1`, [ALICE])
      expect(rows, table).toEqual([{ n: 0 }])
    }
  })
})
