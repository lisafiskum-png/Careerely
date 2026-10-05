import { describe, expect, it } from 'vitest'
import {
  cleanChips,
  firstSearchName,
  isValidEmail,
  isWorkStyle,
  nextOnboardingPath,
  safeNextPath,
  splitFullName,
} from '../../lib/onboarding'
import { POPULAR, scoreMatch, searchOptions } from '../../lib/onboarding-options'

describe('nextOnboardingPath', () => {
  it('resumes at the first unfinished step', () => {
    expect(nextOnboardingPath({ completed: false, hasResume: false })).toBe('/onboarding/2')
    expect(nextOnboardingPath({ completed: false, hasResume: true })).toBe('/onboarding/2')
    expect(nextOnboardingPath({ completed: true, hasResume: true })).toBe('/dashboard')
  })
})

describe('splitFullName', () => {
  it('splits first name from the rest', () => {
    expect(splitFullName('  Lisa   Fiskum ')).toEqual({ first: 'Lisa', last: 'Fiskum' })
    expect(splitFullName('Anne Marie de Vries')).toEqual({ first: 'Anne', last: 'Marie de Vries' })
    expect(splitFullName('Cher')).toEqual({ first: 'Cher', last: '' })
    expect(splitFullName('   ')).toEqual({ first: '', last: '' })
  })
})

describe('safeNextPath', () => {
  it('only allows same-site relative paths', () => {
    expect(safeNextPath('/onboarding/3')).toBe('/onboarding/3')
    expect(safeNextPath('https://evil.example')).toBe('/onboarding')
    expect(safeNextPath('//evil.example')).toBe('/onboarding')
    expect(safeNextPath('/\\evil.example')).toBe('/onboarding')
    expect(safeNextPath(null, '/dashboard')).toBe('/dashboard')
  })
})

describe('validation helpers', () => {
  it('checks emails and work styles', () => {
    expect(isValidEmail('lisa@example.com')).toBe(true)
    expect(isValidEmail('lisa@')).toBe(false)
    expect(isWorkStyle('remote')).toBe(true)
    expect(isWorkStyle('Remote')).toBe(false)
  })

  it('cleans chip input: trims, dedupes case-insensitively, caps', () => {
    expect(cleanChips([' Sales ', 'sales', '', 'Fintech', 42, 'AI', 'Web3'], 3)).toEqual(['Sales', 'Fintech', 'AI'])
    expect(cleanChips('nope', 3)).toEqual([])
  })

  it('names the first search after the target roles', () => {
    expect(firstSearchName(['Business Development Manager'])).toBe('Business Development Manager')
    expect(firstSearchName(['Sales', 'BD', 'Partnerships'])).toBe('Sales + 2 more')
  })
})

describe('Step 3 option search (prototype behaviour)', () => {
  it('ranks prefix matches first', () => {
    expect(searchOptions('fn', 'product man', [])[0]).toBe('Product Manager')
    expect(scoreMatch('product', 'Product Manager')).toBe(90)
  })

  it('resolves aliases', () => {
    expect(searchOptions('fn', 'bd', [])[0]).toBe('Business Development Manager')
    expect(searchOptions('loc', 'nyc', [])[0]).toBe('New York, USA')
    expect(searchOptions('ai', 'crypto', [])[0]).toBe('Blockchain & Crypto')
  })

  it('excludes values already chosen', () => {
    expect(searchOptions('fn', 'product manager', ['Product Manager'])).not.toContain('Product Manager')
  })

  it('has popular lists for every field', () => {
    expect(POPULAR.fn.length).toBeGreaterThan(0)
    expect(POPULAR.ai.length).toBeGreaterThan(0)
    expect(POPULAR.loc.length).toBeGreaterThan(0)
  })
})
