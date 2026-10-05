export type SerpLocation = {
  name?: unknown
  canonical_name?: unknown
  country_code?: unknown
  target_type?: unknown
}

const ALLOWED_TYPES = new Set([
  'Country',
  'State',
  'Province',
  'Region',
  'County',
  'City',
  'Municipality',
  'District',
  'Neighborhood',
])

function cleanLabel(value: string): string {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * SerpApi exposes Google-supported locations worldwide. Keep administrative
 * places useful for a job search and drop things such as universities, airports
 * and DMA/media regions. The API response is external/untrusted, so every field
 * is validated before it reaches the UI.
 */
export function parseLocationSuggestions(payload: unknown, limit = 10): string[] {
  if (!Array.isArray(payload)) return []
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const location = raw as SerpLocation
    const type = typeof location.target_type === 'string' ? location.target_type.trim() : ''
    if (type && !ALLOWED_TYPES.has(type)) continue

    const canonical = typeof location.canonical_name === 'string' ? location.canonical_name.trim() : ''
    const name = typeof location.name === 'string' ? location.name.trim() : ''
    const label = cleanLabel(canonical || name)
    if (!label || label.length > 160) continue

    const key = label.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
    if (out.length >= limit) break
  }

  return out
}
