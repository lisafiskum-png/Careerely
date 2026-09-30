// Onboarding rules shared by pages, API routes and tests. No I/O here.

export const MIN_PASSWORD_LENGTH = 8

// Step 3 limits (CAREERELY_MASTER.md §7): up to 3 roles, up to 5 industries.
export const MAX_ROLES = 3
export const MAX_INDUSTRIES = 5
export const MAX_LOCATIONS = 10

export type OnboardingPath = '/onboarding/2' | '/onboarding/3' | '/dashboard'

export type OnboardingProgress = {
  completed: boolean
  hasResume: boolean
}

/** Where a signed-in user should be sent to continue onboarding. */
export function nextOnboardingPath(progress: OnboardingProgress): OnboardingPath {
  if (progress.completed) return '/dashboard'
  if (progress.hasResume) return '/onboarding/3'
  return '/onboarding/2'
}

/** "Lisa Fiskum" → { first: "Lisa", last: "Fiskum" }; one word → first only. */
export function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Only same-site relative paths are allowed as post-auth redirects. */
export function safeNextPath(value: string | null | undefined, fallback = '/onboarding'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}

// Step 3 work style pills ↔ database enum.
export const WORK_STYLES = [
  { label: 'On-site', value: 'on_site' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Remote', value: 'remote' },
] as const
export type WorkStyle = (typeof WORK_STYLES)[number]['value']

export function isWorkStyle(value: unknown): value is WorkStyle {
  return WORK_STYLES.some(w => w.value === value)
}

/** Name for the first search, created from the career profile. */
export function firstSearchName(roles: string[]): string {
  if (roles.length === 0) return 'Your search'
  if (roles.length === 1) return roles[0]
  return `${roles[0]} + ${roles.length - 1} more`
}

/** Normalises chip input: trims, drops empties and case-insensitive duplicates, caps length. */
export function cleanChips(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (typeof v !== 'string') continue
    const t = v.trim().slice(0, 80)
    const key = t.toLowerCase()
    if (!t || seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length === max) break
  }
  return out
}
