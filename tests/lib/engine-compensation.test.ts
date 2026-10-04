import { describe, expect, it } from 'vitest'
import { greenhouseAnnualPay, parseGreenhouse } from '../../lib/engine/sources'

const board = { provider: 'greenhouse' as const, slug: 'acme', company: 'Acme' }

describe('Greenhouse compensation quality', () => {
  it('keeps plausible annual salary ranges', () => {
    expect(
      greenhouseAnnualPay({ min_cents: 9_000_000, max_cents: 12_000_000, currency_type: 'usd' }),
    ).toEqual({ salary_min: 90_000, salary_max: 120_000, salary_currency: 'USD' })
  })

  it('never treats clearly hourly values as annual salary', () => {
    expect(
      greenhouseAnnualPay(
        { min_cents: 4_600, max_cents: 6_800, currency_type: 'USD' },
        'Compensation: $46–$68 per hour.',
      ),
    ).toEqual({ salary_min: null, salary_max: null, salary_currency: null })
  })

  it('drops other clearly non-annual low ranges instead of guessing', () => {
    expect(
      greenhouseAnnualPay(
        { min_cents: 400_000, max_cents: 600_000, currency_type: 'USD' },
        'The range is $4,000–$6,000 monthly.',
      ),
    ).toEqual({ salary_min: null, salary_max: null, salary_currency: null })
    expect(greenhouseAnnualPay({ min_cents: 4_600, max_cents: 6_800, currency_type: 'USD' })).toEqual({
      salary_min: null,
      salary_max: null,
      salary_currency: null,
    })
  })

  it('drops corrupt/inverted major-currency ranges but does not apply a western-currency ceiling globally', () => {
    expect(greenhouseAnnualPay({ min_cents: 12_000_000, max_cents: 9_000_000, currency_type: 'USD' })).toEqual({
      salary_min: null,
      salary_max: null,
      salary_currency: null,
    })
    expect(greenhouseAnnualPay({ min_cents: 17_900_000_000, max_cents: 18_000_000_000, currency_type: 'USD' })).toEqual({
      salary_min: null,
      salary_max: null,
      salary_currency: null,
    })
    expect(greenhouseAnnualPay({ min_cents: 10_000_000_000, max_cents: 20_000_000_000, currency_type: 'VND' })).toEqual({
      salary_min: 100_000_000,
      salary_max: 200_000_000,
      salary_currency: 'VND',
    })
  })

  it('uses a later plausible Greenhouse range when an earlier range is non-annual', () => {
    const [job] = parseGreenhouse(board, {
      jobs: [
        {
          id: 1,
          title: 'Account Executive',
          absolute_url: 'https://boards.greenhouse.io/acme/jobs/1',
          content: '<p>Compensation varies by location.</p>',
          pay_input_ranges: [
            { min_cents: 4_600, max_cents: 6_800, currency_type: 'USD' },
            { min_cents: 9_000_000, max_cents: 12_000_000, currency_type: 'USD' },
          ],
        },
      ],
    })
    expect(job).toMatchObject({ salary_min: 90_000, salary_max: 120_000, salary_currency: 'USD' })
  })
})
