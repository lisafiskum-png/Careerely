import { describe, expect, it } from 'vitest'
import { AREAS, FUNCTIONS, POPULAR, searchOptions } from './onboarding-options'

describe('global career taxonomy', () => {
  it('covers representative careers well beyond tech', () => {
    for (const role of ['Registered Nurse', 'Teacher', 'Accountant', 'Electrician', 'Chef', 'Lawyer', 'Truck Driver', 'Sales Representative', 'Software Engineer']) {
      expect(FUNCTIONS).toContain(role)
    }
  })

  it('covers broad sectors while retaining technology domains', () => {
    for (const area of ['Healthcare', 'Education', 'Construction', 'Hospitality', 'Manufacturing', 'Legal Services', 'Financial Services', 'AI & Machine Learning']) {
      expect(AREAS).toContain(area)
    }
  })

  it('does not present a tech-only popular list', () => {
    expect(POPULAR.fn).toContain('Registered Nurse')
    expect(POPULAR.fn).toContain('Accountant')
    expect(POPULAR.ai).toContain('Healthcare')
    expect(POPULAR.ai).toContain('Construction')
  })

  it('finds common cross-sector aliases', () => {
    expect(searchOptions('fn', 'rn', [])).toContain('Registered Nurse')
    expect(searchOptions('fn', 'emt', [])).toContain('Emergency Medical Technician')
  })
})
