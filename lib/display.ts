// Formatting for the signed-in app. Display only: every value comes from
// stored data; nothing here adds information.

import type { WorkStyle } from './engine/schema'

/** Master Brief → Company logos: branded letter-tile colours (no logo service). */
const BRAND_HEX: Record<string, string> = {
  shopify: '#96BF48',
  ramp: '#1C1C1C',
  criteo: '#FF6B35',
  nubank: '#820AD1',
  snowflake: '#29B5E8',
  databricks: '#FF3621',
  stripe: '#6C47FF',
  cohere: '#D4531A',
}
const NEUTRAL_TILE = '#2C2C2C'

export function logoTile(company: string | null | undefined): { letter: string; color: string } {
  const name = (company ?? '').trim()
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()
  return { letter, color: BRAND_HEX[name.toLowerCase()] ?? NEUTRAL_TILE }
}

const WORK_STYLE: Record<WorkStyle, string> = { remote: 'Remote', hybrid: 'Hybrid', on_site: 'On-site' }

export function workStyleLabel(style: WorkStyle | null | undefined): string | null {
  return style ? WORK_STYLE[style] : null
}

/** "Dublin, Ireland (Hybrid)" → "Dublin, Ireland" when the work style is shown separately. */
export function locationLabel(location: string | null | undefined, style: WorkStyle | null | undefined): string | null {
  const loc = location?.trim()
  if (!loc) return null
  if (!style) return loc
  // "Remote" as the whole location only repeats the work style.
  if (/^(remote|hybrid|on[- ]?site)$/i.test(loc) && loc.toLowerCase().replace(/[- ]/g, '') === style.replace('_', '')) return null
  return loc.replace(/\s*[(-]\s*(remote|hybrid|on[- ]?site|in[- ]office)\s*\)?\s*$/i, '').trim() || loc
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }

function thousands(n: number): string {
  return `${Math.round(n / 1000).toLocaleString('en-US')}k`
}

/** Annual salary range as posted, e.g. "$120k–$160k". Null when the posting has none. */
export function salaryLabel(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined): string | null {
  const lo = typeof min === 'number' && min > 0 ? min : null
  const hi = typeof max === 'number' && max > 0 ? max : null
  if (lo === null && hi === null) return null
  const code = currency?.toUpperCase() ?? ''
  const sym = CURRENCY_SYMBOL[code]
  const fmt = (n: number) => (sym ? `${sym}${thousands(n)}` : thousands(n))
  const range = lo !== null && hi !== null && lo !== hi ? `${fmt(lo)}–${fmt(hi)}` : fmt((lo ?? hi)!)
  return sym || !code ? range : `${range} ${code}`
}

/** "Dublin, Ireland · Hybrid · $120k–$160k" — only the parts the posting has. */
export function jobMeta(job: {
  location: string | null
  work_style: WorkStyle | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
}): string[] {
  return [
    locationLabel(job.location, job.work_style),
    workStyleLabel(job.work_style),
    salaryLabel(job.salary_min, job.salary_max, job.salary_currency),
  ].filter((p): p is string => Boolean(p))
}

export function initials(first: string | null | undefined, last: string | null | undefined, email: string | null | undefined): string {
  const f = first?.trim()?.[0] ?? ''
  const l = last?.trim()?.[0] ?? ''
  const fromName = `${f}${l}`.toUpperCase()
  if (fromName) return fromName
  return (email?.trim()?.[0] ?? '?').toUpperCase()
}

/** Master Brief → Dashboard: time-based, uppercase. */
export function greeting(hour: number, firstName: string | null | undefined): string {
  const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'
  const name = firstName?.trim()
  return `${part}${name ? `, ${name}` : ''}.`.toUpperCase()
}

/** "just now", "3 min ago", "2 h ago", "yesterday", "4 days ago", then a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime()
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
