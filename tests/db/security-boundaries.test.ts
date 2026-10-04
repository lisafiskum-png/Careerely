import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')
const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'

let db: PGlite

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`)
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
  await db.exec(`
    create table public.profiles (id uuid primary key, email text, plan text default 'standard', voice_sample text);
    alter table public.profiles enable row level security;
    create policy legacy_all on public.profiles for all using (true) with check (true);

    -- These two tables came from the pre-migration prototype and deliberately
    -- do not exist on a clean install. Recreate that legacy state here so this
    -- suite proves the security migration hardens them when they are present.
    create table public.cover_letters (id uuid primary key default gen_random_uuid(), body text);
    create table public.waitlist (id uuid primary key default gen_random_uuid(), email text);
    grant select on public.cover_letters, public.waitlist to anon, authenticated;
  `)
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'alice@example.com', '{"terms_accepted":"true"}'),
      ($2, 'bob@example.com', '{"terms_accepted":"true"}')`,
    [ALICE, BOB],
  )
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end) values
      ($1, 'pro', 'active', now() - interval '1 day', now() + interval '20 days'),
      ($2, 'basic', 'active', now() - interval '1 day', now() + interval '20 days')`,
    [ALICE, BOB],
  )
})

afterAll(async () => db.close())

describe('pre-launch security boundaries', () => {
  it('closes legacy prototype tables to browser roles', async () => {
    const { rows } = await db.query<{ table_name: string; rls: boolean; anon_select: boolean; auth_select: boolean }>(`
      select c.relname as table_name,
             c.relrowsecurity as rls,
             has_table_privilege('anon', 'public.' || c.relname, 'SELECT') as anon_select,
             has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT') as auth_select
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('cover_letters', 'waitlist')
      order by c.relname
    `)
    expect(rows).toEqual([
      { table_name: 'cover_letters', rls: true, anon_select: false, auth_select: false },
      { table_name: 'waitlist', rls: true, anon_select: false, auth_select: false },
    ])
  })

  it('keeps engine/internal RPCs service-role only', async () => {
    const signatures = [
      'public.claim_engine_tasks(integer,integer)',
      'public.reserve_preparations(uuid,uuid[],integer)',
      'public.record_prepared(uuid,uuid)',
      'public.preparations_used(uuid)',
      'public.current_plan(uuid)',
    ]
    for (const signature of signatures) {
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

  it('does not expose trigger helpers as client-callable RPCs', async () => {
    for (const signature of [
      'public.enforce_active_search_limit()',
      'public.handle_new_user()',
      'public.clear_plan_change_pause()',
      'public.guard_application_status()',
      'public.set_updated_at()',
    ]) {
      const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated`,
        [signature],
      )
      expect(rows[0], signature).toEqual({ anon: false, authenticated: false })
    }
  })

  it('lets RLS check the signed-in user but not probe another user', async () => {
    const self = await asUser(ALICE, () => db.query<{ ok: boolean }>('select public.has_active_access($1) as ok', [ALICE]))
    const other = await asUser(ALICE, () => db.query<{ ok: boolean }>('select public.has_active_access($1) as ok', [BOB]))
    expect(self.rows).toEqual([{ ok: true }])
    expect(other.rows).toEqual([{ ok: false }])

    await db.exec('set role anon')
    await expect(db.query('select public.has_active_access($1)', [ALICE])).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('preserves intended signed-in application/status RPC access', async () => {
    const { rows } = await db.query<{ signature: string; ok: boolean }>(`
      select signature, has_function_privilege('authenticated', signature, 'EXECUTE') as ok
      from unnest(array[
        'public.dismiss_plan_change_notice()',
        'public.mark_application_applied(uuid)',
        'public.set_application_status(uuid,text,text)'
      ]) signature
      order by signature
    `)
    expect(rows.every(r => r.ok)).toBe(true)
  })
})
