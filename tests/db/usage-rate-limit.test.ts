import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

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
  await db.query(`insert into auth.users (id, email) values ($1, 'rate-limit@example.com')`, [USER])
})

afterAll(async () => db.close())

async function claim() {
  const { rows } = await db.query<{ ok: boolean }>(
    `select public.claim_usage_event($1, 'resume_parse', 10, 24) as ok`,
    [USER],
  )
  return rows[0].ok
}

describe('atomic usage claims', () => {
  it('records exactly the allowed rolling-window claims and rejects the next one', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 11; i++) results.push(await claim())
    expect(results).toEqual([...Array(10).fill(true), false])

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.usage_events where user_id = $1 and kind = 'resume_parse'`,
      [USER],
    )
    expect(rows).toEqual([{ n: 10 }])
  })

  it('allows another claim after prior events age out of the window', async () => {
    await db.query(
      `update public.usage_events set created_at = now() - interval '25 hours' where user_id = $1 and kind = 'resume_parse'`,
      [USER],
    )
    expect(await claim()).toBe(true)
  })

  it('keeps the claim RPC server-only', async () => {
    const { rows } = await db.query<{ role: string; ok: boolean }>(
      `select r as role,
              has_function_privilege(r, 'public.claim_usage_event(uuid,text,integer,integer)', 'EXECUTE') as ok
       from unnest(array['anon', 'authenticated', 'service_role']) r
       order by r`,
    )
    expect(rows).toEqual([
      { role: 'anon', ok: false },
      { role: 'authenticated', ok: false },
      { role: 'service_role', ok: true },
    ])
  })
})
