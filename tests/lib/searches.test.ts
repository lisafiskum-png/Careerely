import { describe, expect, it } from 'vitest'
import { CURRENCIES, currencyLabel, formatMoney, parseAmount, searchColumns, validateSearch } from '../../lib/search-input'
import { compensationFloor, preferencesText } from '../../lib/engine/context'

const base = {
  name: '  Fintech BD ',
  targetRoles: ['Business Development Manager', ' business development manager ', 'Partnerships Manager'],
  industries: ['Fintech'],
  locations: ['London, UK'],
  workStyles: ['hybrid', 'remote', 'hybrid'],
}

describe('validateSearch (Searches page form rules)', () => {
  it('trims and de-duplicates, keeping free-text values', () => {
    const r = validateSearch({ ...base, targetRoles: [...base.targetRoles, ''], locations: ['Somewhere custom'] })
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Fintech BD',
        targetRoles: ['Business Development Manager', 'Partnerships Manager'],
        industries: ['Fintech'],
        locations: ['Somewhere custom'],
        workStyles: ['hybrid', 'remote'],
        minCompensation: null,
        compensationCurrency: null,
      },
    })
  })

  it('applies the Step 3 limits instead of truncating', () => {
    expect(validateSearch({ ...base, name: ' ' })).toMatchObject({ ok: false, error: 'Give this search a name.' })
    expect(validateSearch({ ...base, targetRoles: [] })).toMatchObject({ ok: false, error: 'Choose at least one target role.' })
    expect(validateSearch({ ...base, targetRoles: ['A', 'B', 'C', 'D'] })).toMatchObject({ ok: false, error: 'Choose up to 3 target roles.' })
    expect(validateSearch({ ...base, industries: ['1', '2', '3', '4', '5', '6'] })).toMatchObject({ ok: false, error: 'Choose up to 5 industries.' })
    expect(validateSearch({ ...base, locations: Array.from({ length: 11 }, (_, i) => `L${i}`) })).toMatchObject({ ok: false, error: 'Choose up to 10 locations.' })
    expect(validateSearch({ ...base, workStyles: [] })).toMatchObject({ ok: false, error: 'Choose at least one work style.' })
    expect(validateSearch({ ...base, workStyles: ['anywhere'] })).toMatchObject({ ok: false })
    expect(validateSearch({ ...base, industries: [], locations: [] }).ok).toBe(true)
  })

  it('requires a currency with a minimum, and sets both or neither', () => {
    expect(validateSearch({ ...base, minCompensation: 70000 })).toMatchObject({ ok: false, error: 'Choose a currency for the minimum compensation.' })
    expect(validateSearch({ ...base, minCompensation: 70000, compensationCurrency: 'XYZ' })).toMatchObject({ ok: false })
    expect(validateSearch({ ...base, minCompensation: 70000, compensationCurrency: 'gbp' })).toMatchObject({ ok: false })
    expect(validateSearch({ ...base, minCompensation: 70000, compensationCurrency: 'XAU' })).toMatchObject({ ok: false })
    // Any ISO 4217 currency in circulation, not a short product list.
    for (const c of ['BRL', 'ZAR', 'PLN', 'MXN', 'NZD', 'KRW']) {
      expect(validateSearch({ ...base, minCompensation: 70000, compensationCurrency: c }), c).toMatchObject({ ok: true, value: { compensationCurrency: c } })
    }
    expect(validateSearch({ ...base, minCompensation: 10_000_000, compensationCurrency: 'GBP' }).ok).toBe(true)
    expect(validateSearch({ ...base, minCompensation: 10_000_001, compensationCurrency: 'GBP' }).ok).toBe(false)
    expect(validateSearch({ ...base, minCompensation: 0, compensationCurrency: 'GBP' })).toMatchObject({ ok: false })
    expect(validateSearch({ ...base, minCompensation: 70000.5, compensationCurrency: 'GBP' })).toMatchObject({ ok: false })
    const ok = validateSearch({ ...base, minCompensation: 70000, compensationCurrency: 'GBP' })
    expect(ok).toMatchObject({ ok: true, value: { minCompensation: 70000, compensationCurrency: 'GBP' } })
    // A currency left selected without an amount is no minimum.
    expect(validateSearch({ ...base, minCompensation: null, compensationCurrency: 'GBP' })).toMatchObject({ ok: true, value: { minCompensation: null, compensationCurrency: null } })
  })

  it('maps to columns without a status (edits never pause or resume)', () => {
    const r = validateSearch({ ...base, minCompensation: 90000, compensationCurrency: 'EUR' })
    if (!r.ok) throw new Error(r.error)
    expect(searchColumns(r.value)).toEqual({
      name: 'Fintech BD',
      target_roles: ['Business Development Manager', 'Partnerships Manager'],
      industries: ['Fintech'],
      locations: ['London, UK'],
      work_styles: ['hybrid', 'remote'],
      min_compensation: 90000,
      compensation_currency: 'EUR',
    })
  })
})

describe('parseAmount / formatMoney', () => {
  it('reads whole amounts with separators and symbols', () => {
    expect(parseAmount('£70,000')).toBe(70000)
    expect(parseAmount(' 70 000 ')).toBe(70000)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('70k')).toBeNaN()
  })
  it('formats whole units', () => {
    expect(formatMoney(70000, 'GBP')).toBe('£70,000')
    expect(formatMoney(90000, 'NOK')).toContain('90,000')
  })
})

describe('compensationFloor (engine input for a search)', () => {
  const none = { min_compensation: null, compensation_currency: null }
  it("uses the search's own amount and currency", () => {
    expect(compensationFloor({ min_compensation: 70000, compensation_currency: 'GBP' }, { min_compensation: 50000, compensation_currency: 'USD' })).toEqual({ amount: 70000, currency: 'GBP' })
  })
  it('falls back to the Career Profile only when it has both an amount and a currency', () => {
    expect(compensationFloor(none, { min_compensation: 50000, compensation_currency: 'USD' })).toEqual({ amount: 50000, currency: 'USD' })
    expect(compensationFloor(none, { min_compensation: 50000, compensation_currency: null })).toBeNull()
    expect(compensationFloor(none, { min_compensation: null, compensation_currency: 'USD' })).toBeNull()
    expect(compensationFloor(none, null)).toBeNull()
  })
  it('never mixes a search amount with another currency', () => {
    expect(compensationFloor({ min_compensation: 70000, compensation_currency: null }, { min_compensation: 50000, compensation_currency: 'USD' })).toBeNull()
  })
  it('reaches the preferences given to the model', () => {
    const minCompensation = compensationFloor({ min_compensation: 70000, compensation_currency: 'GBP' }, null)
    expect(preferencesText({ roles: ['BD'], industries: [], workStyles: [], locations: [], minCompensation })).toContain('Minimum compensation: 70000 GBP')
  })
})

describe('currency picker list', () => {
  it('is canonical ISO 4217: unique, three capital letters, labelled with names', () => {
    expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length)
    expect(CURRENCIES.length).toBeGreaterThan(140)
    for (const c of CURRENCIES) expect(c).toMatch(/^[A-Z]{3}$/)
    expect(currencyLabel('GBP')).toBe('GBP — British Pound')
    expect(currencyLabel('BRL')).toMatch(/^BRL — /)
  })
})
