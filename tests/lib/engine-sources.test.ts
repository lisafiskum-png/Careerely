import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPANY_BOARDS } from '../../lib/engine/companies'
import { dedupeKey, extractRequirements, fetchBoard, parseAshby, parseGreenhouse, parseLever, workStyleFromText } from '../../lib/engine/sources'
import { containsQuote, htmlToText, unsupportedNumbers } from '../../lib/engine/text'

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, `../fixtures/ats/${name}.json`), 'utf8'))

describe('V1 job sources', () => {
  it('uses only Greenhouse, Lever and Ashby company boards', () => {
    expect(new Set(COMPANY_BOARDS.map(b => b.provider))).toEqual(new Set(['greenhouse', 'lever', 'ashby']))
    expect(COMPANY_BOARDS.length).toBeGreaterThan(50)
    const keys = COMPANY_BOARDS.map(b => `${b.provider}:${b.slug}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('parses Greenhouse postings (escaped HTML, pay ranges, requirements)', () => {
    const [bd, eng] = parseGreenhouse({ provider: 'greenhouse', slug: 'stripe', company: 'Stripe' }, fixture('greenhouse'))
    expect(bd).toMatchObject({
      source: 'greenhouse',
      source_job_id: '4011',
      title: 'Business Development Lead, Payments',
      company: 'Stripe',
      location: 'Dublin, Ireland (Hybrid)',
      work_style: 'hybrid',
      salary_min: 90000,
      salary_max: 120000,
      salary_currency: 'EUR',
    })
    expect(bd.description).toContain("Grow Stripe's payments partnerships")
    expect(bd.requirements).toEqual([
      '5+ years in business development or partnerships',
      'Experience with AML or financial compliance',
      'Fluency in English',
    ])
    expect(eng.work_style).toBe('remote')
    expect(eng.salary_min).toBeNull()
  })

  it('parses Lever postings (lists, workplace type, yearly salary only)', () => {
    const [pm, office] = parseLever({ provider: 'lever', slug: 'mercury', company: 'Mercury' }, fixture('lever'))
    expect(pm).toMatchObject({ work_style: 'on_site', location: 'Oslo, Norway', salary_currency: 'NOK', salary_max: 1100000 })
    expect(pm.requirements).toEqual(['3+ years in partnerships', 'Experience selling to banks'])
    expect(office.work_style).toBeNull() // "unspecified" stays unknown
  })

  it('parses Ashby postings and skips unlisted jobs', () => {
    const jobs = parseAshby({ provider: 'ashby', slug: 'cohere', company: 'Cohere' }, fixture('ashby'))
    expect(jobs).toHaveLength(2) // the unlisted posting is skipped
    expect(jobs[0]).toMatchObject({ work_style: 'hybrid', salary_currency: 'GBP', salary_min: 90000 })
    expect(jobs[0].requirements).toEqual(['You have closed six-figure enterprise deals', 'You understand regulated industries'])
  })

  it('fetches from the documented public endpoints and surfaces HTTP errors', async () => {
    const urls: string[] = []
    const fake = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(fixture('greenhouse')), { status: 200 })
    }) as unknown as typeof fetch
    await fetchBoard({ provider: 'greenhouse', slug: 'stripe', company: 'Stripe' }, fake)
    expect(urls[0]).toBe('https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true&pay_transparency=true')

    const notFound = (async () => new Response('no', { status: 404 })) as unknown as typeof fetch
    await expect(fetchBoard({ provider: 'lever', slug: 'gone', company: 'Gone' }, notFound)).rejects.toThrow(/HTTP 404/)
  })

  it('never guesses a work style from ambiguous locations', () => {
    expect(workStyleFromText('Remote (Europe)')).toBe('remote')
    expect(workStyleFromText('London or Remote')).toBeNull()
    expect(workStyleFromText('Oslo, Norway')).toBeNull()
  })

  it('builds a cross-board dedupe key', () => {
    expect(dedupeKey('Stripe', 'Business Development Lead', 'Dublin, Ireland')).toBe(
      dedupeKey('stripe', 'Business  Development Lead', 'Dublin Ireland'),
    )
  })

  it('falls back to all bullets when there are no requirement headings', () => {
    expect(extractRequirements('Intro\n• Own the enterprise pipeline\n• Travel to clients')).toEqual([
      'Own the enterprise pipeline',
      'Travel to clients',
    ])
  })
})

describe('text helpers', () => {
  it('converts HTML to text with bullets', () => {
    expect(htmlToText('<p>Hi</p><ul><li>One</li><li>Two</li></ul>')).toBe('Hi\n• One\n• Two')
  })

  it('verifies quotes after normalising whitespace, case and punctuation', () => {
    const resume = 'Led due-diligence   on complex\ncrypto cases for “enterprise” clients.'
    expect(containsQuote(resume, 'led due‑diligence on complex crypto cases')).toBe(true)
    expect(containsQuote(resume, 'Led a team of 12 analysts')).toBe(false)
    expect(containsQuote(resume, 'ok')).toBe(false)
  })

  it('folds Unicode the way PDFs and job boards write it', () => {
    const pdf = 'Certiﬁed AML specialist for Nordic Bank’s largest\u00a0clients — 2018–2021'
    expect(containsQuote(pdf, 'Certified AML specialist')).toBe(true) // ligature
    expect(containsQuote(pdf, "Nordic Bank's largest clients")).toBe(true) // curly apostrophe, no-break space
    expect(containsQuote(pdf, 'clients - 2018-2021')).toBe(true) // dashes
    expect(containsQuote(pdf, '“Certified AML specialist.”')).toBe(true) // wrapping quotes, end punctuation
  })

  it('only matches whole words', () => {
    const resume = 'Excellent stakeholder skills. NoSQL databases. JavaScript. C++ and Go.'
    expect(containsQuote(resume, 'Excel')).toBe(false)
    expect(containsQuote(resume, 'SQL')).toBe(false)
    expect(containsQuote(resume, 'Java')).toBe(false)
    expect(containsQuote(resume, 'stakeholder skills')).toBe(true)
    expect(containsQuote(resume, 'C++')).toBe(true)
    expect(containsQuote(resume, 'NoSQL databases')).toBe(true)
  })

  it('never stitches a quote across bullets, paragraphs or structured fields', () => {
    const text = 'Led due diligence on complex crypto cases\n• Worked with sales\n\nBuilt a pipeline\u2029Skills: AML, KYC\u2029Languages: English'
    expect(containsQuote(text, 'crypto cases Worked with sales')).toBe(false) // bullet
    expect(containsQuote(text, 'with sales Built a pipeline')).toBe(false) // blank line
    expect(containsQuote(text, 'KYC Languages: English')).toBe(false) // structured fields
    expect(containsQuote(['Requirements: SQL', 'Python'], 'SQL Python')).toBe(false) // separate lines
    expect(containsQuote(text, 'Skills: AML, KYC')).toBe(true)
    // A single line break inside a paragraph is a wrapped PDF line, not a boundary.
    expect(containsQuote('Worked with sales on onboarding\nenterprise clients', 'onboarding enterprise clients')).toBe(true)
  })

  it('flags numbers that do not appear in the sources', () => {
    expect(unsupportedNumbers('I bring 5 years and grew revenue 40%.', ['5 years of experience'])).toEqual(['40%'])
    expect(unsupportedNumbers('Built a pipeline of 1,200 partners', ['pipeline of 1200 partners'])).toEqual([])
  })
})

describe('isWebUrl (posting links are opened from the app)', () => {
  it('keeps only http(s) links', async () => {
    const { isWebUrl } = await import('../../lib/engine/sources')
    expect(isWebUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe(true)
    expect(isWebUrl('http://jobs.lever.co/acme/1')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example', '', null, undefined, 42, 'https://x y']) {
      expect(isWebUrl(bad), String(bad)).toBe(false)
    }
  })
})
