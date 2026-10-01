import { describe, expect, it } from 'vitest'
import { greeting, initials, jobMeta, locationLabel, logoTile, relativeTime, salaryLabel } from '../../lib/display'
import { renderTextPdf, toPdfText } from '../../lib/pdf'

describe('display formatting (no added information)', () => {
  it('uses letter tiles with the locked brand colours, neutral otherwise', () => {
    expect(logoTile('Stripe')).toEqual({ letter: 'S', color: '#6C47FF' })
    expect(logoTile('cohere')).toEqual({ letter: 'C', color: '#D4531A' })
    expect(logoTile('Acme Corp')).toEqual({ letter: 'A', color: '#2C2C2C' })
    expect(logoTile('')).toEqual({ letter: '?', color: '#2C2C2C' })
  })

  it('shows only the salary the posting states', () => {
    expect(salaryLabel(120000, 160000, 'USD')).toBe('$120k–$160k')
    expect(salaryLabel(90000, 115000, 'eur')).toBe('€90k–€115k')
    expect(salaryLabel(900000, 1100000, 'NOK')).toBe('900k–1,100k NOK')
    expect(salaryLabel(null, 150000, 'GBP')).toBe('£150k')
    expect(salaryLabel(null, null, 'USD')).toBeNull()
  })

  it('builds the meta line from the posting fields that exist', () => {
    expect(locationLabel('Dublin, Ireland (Hybrid)', 'hybrid')).toBe('Dublin, Ireland')
    expect(jobMeta({ location: 'Dublin, Ireland (Hybrid)', work_style: 'hybrid', salary_min: 120000, salary_max: 160000, salary_currency: 'USD' })).toEqual([
      'Dublin, Ireland',
      'Hybrid',
      '$120k–$160k',
    ])
    expect(jobMeta({ location: null, work_style: null, salary_min: null, salary_max: null, salary_currency: null })).toEqual([])
  })

  it('greets in uppercase by local time (Master Brief → Dashboard)', () => {
    expect(greeting(8, 'Lisa')).toBe('GOOD MORNING, LISA.')
    expect(greeting(13, 'Lisa')).toBe('GOOD AFTERNOON, LISA.')
    expect(greeting(22, null)).toBe('GOOD EVENING.')
    expect(initials('Lisa', 'Fiskum', 'x@y.z')).toBe('LF')
    expect(initials(null, null, 'lisa@example.com')).toBe('L')
  })

  it('formats relative times', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(relativeTime('2026-10-01T11:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-10-01T11:57:00Z', now)).toBe('3 min ago')
    expect(relativeTime('2026-10-01T09:00:00Z', now)).toBe('3 h ago')
    expect(relativeTime('2026-09-30T10:00:00Z', now)).toBe('yesterday')
    expect(relativeTime('2026-09-01T10:00:00Z', now)).toBe('1 September 2026')
  })
})

describe('PDF documents', () => {
  it('keeps Western European text and transliterates the rest', () => {
    expect(toPdfText('Søknad — “Ærlig” Zürich €')).toBe('Søknad — “Ærlig” Zürich €')
    expect(toPdfText('Łódź ćwiczenie')).toBe('Lódz cwiczenie')
  })

  it('renders the stored text into a PDF whose text can be extracted again', async () => {
    const body = 'Lisa Fiskum\n\nAML Analyst, Nordic Bank\n• Led due diligence on complex crypto cases, working closely with commercial teams'
    const pdf = renderTextPdf({ title: 'Resume - Stripe', body })
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF')
    const { extractText, getDocumentProxy } = await import('unpdf')
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true })
    expect(text.replace(/\s+/g, ' ')).toContain('Led due diligence on complex crypto cases, working closely with commercial teams')
  })
})
