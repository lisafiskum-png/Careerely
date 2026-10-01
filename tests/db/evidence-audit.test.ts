import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { flattenResume, jobDocument, preferencesText, resumeCorpus } from '../../lib/engine/context'
import { containsQuote, lineSegments } from '../../lib/engine/text'
import type { Resume } from '../../lib/resume/schema'

// The production evidence audit (supabase/audit/evidence_traceability.sql)
// must agree with the engine's validator on every row, and must classify the
// known false negatives of a naive audit as traceable.

const root = path.resolve(import.meta.dirname, '../..')
const USER = '33333333-3333-3333-3333-333333333333'

const RESUME: Resume = {
  full_name: 'Lisa Fiskum',
  headline: 'AML compliance professional',
  email: 'lisa@example.com',
  phone: '',
  location: 'Oslo, Norway',
  links: [],
  summary: 'AML professional with excellent stakeholder skills and a business development background.',
  experience: [
    { title: 'AML Analyst', company: 'Nordic Bank', location: 'Oslo', start: '2021', end: '', current: true, highlights: ['Led due diligence on complex crypto cases', 'Worked with sales on onboarding enterprise clients'] },
    { title: 'Business Development Associate', company: 'Fintech Startup', location: '', start: '2018', end: '2021', current: false, highlights: ['Built a pipeline of 40 partner banks'] },
  ],
  education: [{ degree: 'BSc', field: 'Economics', institution: 'University of Oslo', start: '2015', end: '2018' }],
  skills: ['AML', 'KYC', 'Python', 'NoSQL databases'],
  languages: ['English', 'Norwegian'],
  certifications: [],
}

// Raw PDF text: a ligature, a curly apostrophe, a no-break space, a wrapped line.
const RESUME_TEXT = 'Lisa Fiskum\nCertiﬁed AML specialist serving Nordic Bank’s largest clients\n\nWorked with sales on onboarding\nenterprise clients across the Nordics'

const JOB = {
  title: 'Business Development Lead, Payments',
  company: 'Stripe',
  location: 'Dublin, Ireland (Hybrid)',
  salary_min: 90000,
  salary_max: 120000,
  salary_currency: 'EUR',
  description: 'Grow Stripe’s payments partnerships across Europe.\nWhat you’ll need\n• 5+ years in business development or partnerships\n• Experience with AML or financial compliance',
}

const PREFS = {
  roles: ['Business Development Manager', 'Account Executive'],
  industries: ['Fintech'],
  workStyles: ['hybrid' as const, 'remote' as const],
  locations: ['Dublin, Ireland', 'Oslo, Norway'],
  minCompensation: null,
}

type Case = { source: 'resume_text' | 'job_description' | 'user_preference' | 'agent_inference'; quote: string; traceable: boolean; old: boolean; why: string }

const CASES: Case[] = [
  // Traceable; a naive audit (raw resume_text + resume_data JSON, whitespace only) misses these.
  { source: 'resume_text', quote: '• Led due diligence on complex crypto cases', traceable: true, old: true, why: 'bullet prefix from the structured resume' },
  { source: 'resume_text', quote: 'Skills: AML, KYC, Python', traceable: true, old: true, why: 'structured skills line' },
  { source: 'resume_text', quote: 'AML Analyst — Nordic Bank, Oslo (2021–present)', traceable: true, old: true, why: 'structured experience header' },
  { source: 'resume_text', quote: 'Business Development Associate - Fintech Startup (2018-2021)', traceable: true, old: true, why: 'dash variants' },
  { source: 'resume_text', quote: '“Built a pipeline of 40 partner banks.”', traceable: true, old: true, why: 'wrapping quotes and end punctuation' },
  { source: 'resume_text', quote: 'Certified AML specialist', traceable: true, old: true, why: 'PDF ligature (NFKC)' },
  { source: 'resume_text', quote: "Nordic Bank's largest clients", traceable: true, old: true, why: 'curly apostrophe and no-break space' },
  { source: 'resume_text', quote: 'onboarding enterprise clients across the Nordics', traceable: true, old: true, why: 'wrapped PDF line' },
  { source: 'resume_text', quote: 'BSc Economics, University of Oslo', traceable: true, old: true, why: 'structured education line' },
  // Accepted by the old validator, rejected now.
  { source: 'resume_text', quote: 'Excel', traceable: false, old: true, why: 'sub-word of "excellent"' },
  { source: 'resume_text', quote: 'SQL', traceable: false, old: true, why: 'sub-word of "NoSQL"' },
  { source: 'resume_text', quote: 'crypto cases Worked with sales', traceable: false, old: true, why: 'stitches two bullets' },
  { source: 'resume_text', quote: 'NoSQL databases Languages: English', traceable: false, old: true, why: 'stitches two resume fields' },
  // Never traceable.
  { source: 'resume_text', quote: 'Managed a team of 50 analysts', traceable: false, old: false, why: 'fabricated' },
  { source: 'job_description', quote: 'Salary: 90000–120000 EUR', traceable: true, old: true, why: 'job salary line' },
  { source: 'job_description', quote: 'Dublin, Ireland (Hybrid)', traceable: true, old: true, why: 'job location' },
  { source: 'job_description', quote: 'Grow Stripe’s payments partnerships', traceable: true, old: true, why: 'description sentence' },
  { source: 'job_description', quote: '5+ years in business development or partnerships', traceable: true, old: true, why: 'requirement bullet' },
  { source: 'job_description', quote: 'partnerships Experience with AML', traceable: false, old: true, why: 'stitches two bullets' },
  { source: 'job_description', quote: 'Fluency in German', traceable: false, old: false, why: 'fabricated' },
  { source: 'user_preference', quote: 'Business Development Manager', traceable: true, old: true, why: 'target role' },
  { source: 'agent_inference', quote: 'AML Analyst', traceable: true, old: true, why: 'resume words behind a judgment' },
]

let db: PGlite
let rows: { source_text: string; source_type: string; verdict: string }[] = []

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'))
  const dir = path.join(root, 'supabase/migrations')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(path.join(dir, f), 'utf8'))

  await db.query(`insert into auth.users (id, email) values ($1, 'audit@example.com')`, [USER])
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
     values ($1, 'basic', 'active', now(), now() + interval '30 days')`,
    [USER],
  )
  await db.query(`insert into public.career_profiles (user_id, resume_text, resume_data) values ($1, $2, $3)`, [USER, RESUME_TEXT, JSON.stringify(RESUME)])
  const job = await db.query<{ id: string }>(
    `insert into public.jobs (source, source_job_id, url, title, company, location, description, salary_min, salary_max, salary_currency)
     values ('greenhouse', '1', 'https://example.com', $1, $2, $3, $4, $5, $6, $7) returning id`,
    [JOB.title, JOB.company, JOB.location, JOB.description, JOB.salary_min, JOB.salary_max, JOB.salary_currency],
  )
  const search = await db.query<{ id: string }>(
    `insert into public.searches (user_id, name, target_roles, industries, work_styles, locations)
     values ($1, 'BD', $2, $3, string_to_array($4, ',')::public.work_style[], $5) returning id`,
    [USER, PREFS.roles, PREFS.industries, PREFS.workStyles.join(','), PREFS.locations],
  )
  const opp = await db.query<{ id: string }>(
    `insert into public.opportunities (user_id, job_id, search_id) values ($1, $2, $3) returning id`,
    [USER, job.rows[0].id, search.rows[0].id],
  )
  for (const c of CASES) {
    await db.query(
      `insert into public.evidence (user_id, opportunity_id, job_id, signal_type, source_type, source_text, claim, outcome)
       values ($1, $2, $3, 'requirement_met', $4, $5, 'claim', $6)`,
      [USER, opp.rows[0].id, job.rows[0].id, c.source, c.quote, c.source === 'agent_inference' ? 'inferred' : 'confirmed'],
    )
  }

  const results = await db.exec(readFileSync(path.join(root, 'supabase/audit/evidence_traceability.sql'), 'utf8'))
  rows = results[results.length - 1].rows as typeof rows
})

describe('evidence traceability audit', () => {
  it('returns one row per evidence record', () => {
    expect(rows).toHaveLength(CASES.length)
  })

  it.each(CASES)('$source “$quote” ($why)', c => {
    const row = rows.find(r => r.source_text === c.quote && r.source_type === c.source)!
    const expected = c.traceable ? 'traceable' : c.old ? 'weak_match' : 'not_in_source'
    expect(row.verdict).toBe(expected)
  })

  it('shows why the first spot-check query reported traceable rows as missing', async () => {
    // The query from the staging guide: raw resume_text + resume_data JSON,
    // job title/location/description only, whitespace-only normalisation.
    const naive = await db.query<{ source_text: string; found: boolean | null }>(`
      select e.source_text,
        case e.source_type
          when 'job_description' then position(lower(regexp_replace(e.source_text,'\\s+',' ','g')) in lower(regexp_replace(j.title||' '||coalesce(j.location,'')||' '||coalesce(j.description,''),'\\s+',' ','g'))) > 0
          when 'resume_text' then position(lower(regexp_replace(e.source_text,'\\s+',' ','g')) in lower(regexp_replace(c.resume_text||' '||c.resume_data::text,'\\s+',' ','g'))) > 0
        end as found
      from public.evidence e join public.jobs j on j.id = e.job_id join public.career_profiles c on c.user_id = e.user_id`)
    const missed = naive.rows.filter(r => r.found === false).map(r => r.source_text)
    expect(missed).toEqual(
      expect.arrayContaining([
        '• Led due diligence on complex crypto cases',
        'Skills: AML, KYC, Python',
        'AML Analyst — Nordic Bank, Oslo (2021–present)',
        '“Built a pipeline of 40 partner banks.”',
        'Certified AML specialist',
        "Nordic Bank's largest clients",
        'BSc Economics, University of Oslo',
        'Salary: 90000–120000 EUR',
        'Business Development Associate - Fintech Startup (2018-2021)',
      ]),
    )
    // …while passing the sub-word match the validator now rejects.
    expect(naive.rows.find(r => r.source_text === 'Excel')!.found).toBe(true)
  })

  it('is plain ASCII, so pasting it into an editor cannot silently change it', () => {
    const sql = readFileSync(path.join(root, 'supabase/audit/evidence_traceability.sql'), 'utf8')
    expect([...sql].filter(c => c.charCodeAt(0) > 127)).toEqual([])
  })

  it('refuses to run when its matching rules have been altered', async () => {
    // The failure seen in production: the segment break was dropped, leaving an
    // empty alternative that split every source into single characters.
    const altered = readFileSync(path.join(root, 'supabase/audit/evidence_traceability.sql'), 'utf8').replace('|\\u2029|', '||')
    expect(altered).toContain("\\n||[")
    await expect(db.exec(altered)).rejects.toThrow(/self-test failed/)
  })

  it('agrees with the engine validator on every row', () => {
    const resume = resumeCorpus(RESUME_TEXT, flattenResume(RESUME))
    const job = lineSegments(jobDocument(JOB))
    const prefs = lineSegments(preferencesText(PREFS))
    const sources = { resume_text: [resume], job_description: job, user_preference: prefs, agent_inference: [resume, ...job] }
    for (const c of CASES) {
      expect(containsQuote(sources[c.source], c.quote), `${c.source}: ${c.quote}`).toBe(c.traceable)
    }
  })
})
