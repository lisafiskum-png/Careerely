import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')
const USER = '71111111-1111-1111-1111-111111111111'

let db: PGlite
let jobId = ''
let searchId = ''

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
  await db.exec(`
    create table public.profiles (id uuid primary key, email text, plan text default 'standard', voice_sample text);
    alter table public.profiles enable row level security;
    create policy legacy_all on public.profiles for all using (true) with check (true);
  `)
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'queue@example.com', '{"terms_accepted":"true"}')`,
    [USER],
  )
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
     values ($1, 'pro', 'active', now() - interval '1 day', now() + interval '20 days')`,
    [USER],
  )
  jobId = (await db.query<{ id: string }>(
    `insert into public.jobs (source, source_job_id, url, title)
     values ('greenhouse', 'queue-test', 'https://example.com/job', 'Account Executive') returning id`,
  )).rows[0].id
  searchId = (await db.query<{ id: string }>(
    `insert into public.searches (user_id, name, status) values ($1, 'Queue test', 'active') returning id`,
    [USER],
  )).rows[0].id
})

afterAll(async () => db.close())

async function reservation(tag: string) {
  const runId = (await db.query<{ id: string }>(
    `insert into public.search_runs (user_id, search_id, status) values ($1, $2, 'running') returning id`,
    [USER, searchId],
  )).rows[0].id
  const oppId = (await db.query<{ id: string }>(
    `insert into public.opportunities (user_id, job_id, search_id, run_id, state, preparing_started_at, reasoning)
     values ($1, $2, $3, $4, 'preparing', now(), $5) returning id`,
    [USER, jobId, searchId, runId, tag],
  )).rows[0].id
  const packageId = (await db.query<{ id: string }>(
    `insert into public.application_packages (user_id, opportunity_id, status, quota_period_start)
     values ($1, $2, 'preparing', now() - interval '1 day') returning id`,
    [USER, oppId],
  )).rows[0].id
  return { runId, oppId, packageId }
}

describe('package queue recovery', () => {
  it('finalizes package, opportunity, application, run counter and activity atomically/idempotently', async () => {
    const r = await reservation('finalize')
    const args = [r.oppId, r.packageId, '[]', 'Tailored resume', '{"text":"Tailored resume"}', false, '[]', 'Cover letter', 'model']
    await db.query(
      `select public.finalize_application_package($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::jsonb, $8, $9)`,
      args,
    )
    // Simulate a worker that committed finalization but died before marking the
    // queue task done: replaying finalization must not duplicate side effects.
    await db.query(
      `select public.finalize_application_package($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::jsonb, $8, $9)`,
      args,
    )

    expect((await db.query(`select status::text from public.application_packages where id = $1`, [r.packageId])).rows)
      .toEqual([{ status: 'ready' }])
    expect((await db.query(`select state::text from public.opportunities where id = $1`, [r.oppId])).rows)
      .toEqual([{ state: 'ready' }])
    expect((await db.query(`select count(*)::int as n from public.applications where opportunity_id = $1`, [r.oppId])).rows)
      .toEqual([{ n: 1 }])
    expect((await db.query(`select count(*)::int as n from public.activity where kind = 'application_prepared' and opportunity_id = $1`, [r.oppId])).rows)
      .toEqual([{ n: 1 }])
    expect((await db.query(`select jobs_prepared, prepared_opportunity_ids from public.search_runs where id = $1`, [r.runId])).rows)
      .toEqual([{ jobs_prepared: 1, prepared_opportunity_ids: [r.oppId] }])
  })

  it('keeps finalization/failure RPCs server-only', async () => {
    for (const signature of [
      'public.finalize_application_package(uuid,uuid,jsonb,text,jsonb,boolean,jsonb,text,text)',
      'public.fail_application_package(uuid,uuid,text)',
    ]) {
      const { rows } = await db.query<{ role: string; ok: boolean }>(
        `select r as role, has_function_privilege(r, $1, 'EXECUTE') as ok
         from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
        [signature],
      )
      expect(rows, signature).toEqual([
        { role: 'anon', ok: false },
        { role: 'authenticated', ok: false },
        { role: 'service_role', ok: true },
      ])
    }
  })

  it('cleans a package when its final leased task expires', async () => {
    const r = await reservation('expired-package')
    const taskId = (await db.query<{ id: string }>(
      `insert into public.engine_tasks
        (kind, user_id, opportunity_id, payload, status, attempts, max_attempts, locked_until, run_after, dedupe_key)
       values
        ('prepare_package', $1, $2, jsonb_build_object('package_id', $3::text), 'running', 3, 3,
         now() - interval '1 minute', now() - interval '1 hour', $4)
       returning id`,
      [USER, r.oppId, r.packageId, `prepare:${r.oppId}:${r.packageId}`],
    )).rows[0].id

    await db.query(`select * from public.claim_engine_tasks(10, 600)`)

    expect((await db.query(`select status from public.engine_tasks where id = $1`, [taskId])).rows)
      .toEqual([{ status: 'failed' }])
    expect((await db.query(`select status::text from public.application_packages where id = $1`, [r.packageId])).rows)
      .toEqual([{ status: 'failed' }])
    expect((await db.query(`select state::text, preparing_started_at from public.opportunities where id = $1`, [r.oppId])).rows)
      .toEqual([{ state: 'shortlisted', preparing_started_at: null }])
  })

  it('cleans a running search when its final leased scan task expires', async () => {
    const runId = (await db.query<{ id: string }>(
      `insert into public.search_runs (user_id, search_id, status) values ($1, $2, 'running') returning id`,
      [USER, searchId],
    )).rows[0].id
    const taskId = (await db.query<{ id: string }>(
      `insert into public.engine_tasks
        (kind, user_id, search_id, payload, status, attempts, max_attempts, locked_until, run_after, dedupe_key)
       values
        ('scan_search', $1, $2, jsonb_build_object('phase', 'evaluate', 'run_id', $3::text), 'running', 3, 3,
         now() - interval '1 minute', now() - interval '1 hour', $4)
       returning id`,
      [USER, searchId, runId, `scan:expired:${runId}`],
    )).rows[0].id

    await db.query(`select * from public.claim_engine_tasks(10, 600)`)

    expect((await db.query(`select status from public.engine_tasks where id = $1`, [taskId])).rows)
      .toEqual([{ status: 'failed' }])
    const { rows } = await db.query<{ status: string; finished: boolean }>(
      `select status, finished_at is not null as finished from public.search_runs where id = $1`,
      [runId],
    )
    expect(rows).toEqual([{ status: 'failed', finished: true }])
  })
})
