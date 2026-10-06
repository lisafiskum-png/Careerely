import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')
const USER = '81111111-1111-1111-1111-111111111111'

let db: PGlite

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
     values ($1, 'search-invariants@example.com', '{"terms_accepted":"true"}')`,
    [USER],
  )
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
     values ($1, 'basic', 'active', now() - interval '1 day', now() + interval '20 days')`,
    [USER],
  )
})

afterAll(async () => db.close())

describe('search database invariants', () => {
  it('accepts a valid search shape', async () => {
    await expect(db.query(
      `insert into public.searches
       (user_id, name, target_roles, industries, locations, work_styles, min_compensation, compensation_currency, status)
       values ($1, 'Sales UK', array['Account Executive'], array['SaaS'], array['London, UK'], array['hybrid']::public.work_style[], 90000, 'GBP', 'paused')`,
      [USER],
    )).resolves.toBeDefined()
  })

  it.each([
    ['blank name', `insert into public.searches (user_id, name, target_roles, work_styles, status) values ($1, '   ', array['AE'], array['remote']::public.work_style[], 'paused')`],
    ['too many roles', `insert into public.searches (user_id, name, target_roles, work_styles, status) values ($1, 'x', array['a','b','c','d'], array['remote']::public.work_style[], 'paused')`],
    ['duplicate roles', `insert into public.searches (user_id, name, target_roles, work_styles, status) values ($1, 'x', array['Sales',' sales '], array['remote']::public.work_style[], 'paused')`],
    ['oversized chip', `insert into public.searches (user_id, name, target_roles, work_styles, status) values ($1, 'x', array[repeat('a',81)], array['remote']::public.work_style[], 'paused')`],
    ['too many locations', `insert into public.searches (user_id, name, target_roles, locations, work_styles, status) values ($1, 'x', array['a'], array['1','2','3','4','5','6','7','8','9','10','11'], array['remote']::public.work_style[], 'paused')`],
    ['bad compensation', `insert into public.searches (user_id, name, target_roles, work_styles, min_compensation, compensation_currency, status) values ($1, 'x', array['a'], array['remote']::public.work_style[], 10000001, 'USD', 'paused')`],
  ])('rejects %s', async (_label, sql) => {
    await expect(db.query(sql, [USER])).rejects.toThrow()
  })

  it('serializes active-search transitions per user', async () => {
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_functiondef('public.enforce_active_search_limit()'::regprocedure) as def`,
    )
    expect(rows[0].def).toContain('pg_advisory_xact_lock')
  })

  it('starts at most one running scan and allows a later retry', async () => {
    const { rows: searches } = await db.query<{ id: string }>(
      `insert into public.searches
       (user_id, name, target_roles, work_styles, status)
       values ($1, 'Atomic run', array['Product Manager'], array['remote']::public.work_style[], 'active')
       returning id`,
      [USER],
    )
    const searchId = searches[0].id

    const first = await db.query<{ start_search_run: string | null }>(
      `select public.start_search_run($1, $2)`,
      [USER, searchId],
    )
    const duplicate = await db.query<{ start_search_run: string | null }>(
      `select public.start_search_run($1, $2)`,
      [USER, searchId],
    )

    expect(first.rows[0].start_search_run).toBeTruthy()
    expect(duplicate.rows[0].start_search_run).toBeNull()

    await db.query(
      `update public.search_runs
       set status = 'failed', finished_at = now()
       where id = $1`,
      [first.rows[0].start_search_run],
    )
    const retry = await db.query<{ start_search_run: string | null }>(
      `select public.start_search_run($1, $2)`,
      [USER, searchId],
    )
    expect(retry.rows[0].start_search_run).toBeTruthy()
  })
})
