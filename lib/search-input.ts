// Searches page (Phase D5) form rules, shared by the API routes, the form and
// tests. No I/O here.
//
// Step 3 limits apply (decision 2026-10-01): 1–3 roles, up to 5 industries, up
// to 10 locations, at least one work style. Roles, industries and locations
// accept free text; work style is a fixed choice.

import { MAX_INDUSTRIES, MAX_LOCATIONS, MAX_ROLES, isWorkStyle, type WorkStyle } from './onboarding'

export const MAX_SEARCH_NAME = 80
/** Upper bound for an annual minimum, to catch typos (an extra digit or two). */
export const MAX_COMPENSATION = 10_000_000

/** Currencies offered next to the minimum compensation (ISO 4217). */
export const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'SGD', 'AED', 'INR', 'JPY'] as const
export type Currency = (typeof CURRENCIES)[number]

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}

export type SearchInput = {
  name: string
  targetRoles: string[]
  industries: string[]
  locations: string[]
  workStyles: WorkStyle[]
  /** Annual, in compensationCurrency. Both set or both null. */
  minCompensation: number | null
  compensationCurrency: Currency | null
}

/** Trims, drops empties and case-insensitive duplicates (no cap: limits are checked, not truncated). */
function chips(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (typeof v !== 'string') continue
    const t = v.trim().slice(0, 80)
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out
}

/** "£70,000" / "70 000" / "70000" → 70000; blank → null; anything else → NaN. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[\s,._'£$€¥₹]/g, '')
  if (!t) return null
  return /^\d+$/.test(t) ? Number(t) : NaN
}

export function validateSearch(body: unknown): { ok: true; value: SearchInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return { ok: false, error: 'Give this search a name.' }
  if (name.length > MAX_SEARCH_NAME) return { ok: false, error: `Keep the name under ${MAX_SEARCH_NAME} characters.` }

  const targetRoles = chips(b.targetRoles)
  if (targetRoles.length === 0) return { ok: false, error: 'Choose at least one target role.' }
  if (targetRoles.length > MAX_ROLES) return { ok: false, error: `Choose up to ${MAX_ROLES} target roles.` }
  const industries = chips(b.industries)
  if (industries.length > MAX_INDUSTRIES) return { ok: false, error: `Choose up to ${MAX_INDUSTRIES} industries.` }
  const locations = chips(b.locations)
  if (locations.length > MAX_LOCATIONS) return { ok: false, error: `Choose up to ${MAX_LOCATIONS} locations.` }

  const styles = Array.isArray(b.workStyles) ? b.workStyles : []
  if (!styles.every(isWorkStyle)) return { ok: false, error: 'Choose a work style.' }
  const workStyles = [...new Set(styles as WorkStyle[])]
  if (workStyles.length === 0) return { ok: false, error: 'Choose at least one work style.' }

  const amount = b.minCompensation ?? null
  if (amount === null) return { ok: true, value: { name, targetRoles, industries, locations, workStyles, minCompensation: null, compensationCurrency: null } }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_COMPENSATION) {
    return { ok: false, error: 'Enter the minimum as a whole annual amount, or leave it blank.' }
  }
  if (!isCurrency(b.compensationCurrency)) return { ok: false, error: 'Choose a currency for the minimum compensation.' }
  return { ok: true, value: { name, targetRoles, industries, locations, workStyles, minCompensation: amount, compensationCurrency: b.compensationCurrency } }
}

/** Database columns for a validated search. */
export function searchColumns(v: SearchInput) {
  return {
    name: v.name,
    target_roles: v.targetRoles,
    industries: v.industries,
    locations: v.locations,
    work_styles: v.workStyles,
    min_compensation: v.minCompensation,
    compensation_currency: v.compensationCurrency,
  }
}

/** "£70,000" (whole units, no decimals). */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toLocaleString('en-US')} ${currency}`
  }
}

/** API response for a refused write: the plan's active-search limit, or a read-only account. */
export function searchWriteError(error: { hint?: string | null }): Response {
  if (error.hint === 'active_search_limit') return Response.json({ error: 'active_search_limit' }, { status: 409 })
  return Response.json({ error: 'Your account can’t change searches right now.' }, { status: 403 })
}
