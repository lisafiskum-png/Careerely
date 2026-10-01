import { parse } from 'node-html-parser'

// Text helpers shared by ingestion, filtering and evidence verification.

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** HTML job description → readable plain text with line breaks and bullets. */
export function htmlToText(html: string): string {
  if (!html) return ''
  // Greenhouse returns HTML with entities escaped once more.
  const decoded = /&lt;[a-z/]/i.test(html) ? decodeEntities(html) : html
  const root = parse(decoded, { blockTextElements: { script: false, style: false } })
  for (const li of root.querySelectorAll('li')) li.insertAdjacentHTML('afterbegin', '• ')
  for (const el of root.querySelectorAll('br')) el.replaceWith('\n')
  for (const el of root.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, ul, ol, tr')) {
    el.insertAdjacentHTML('afterend', '\n')
  }
  return decodeEntities(root.textContent)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Unicode-fold (NFKC: ligatures, no-break spaces…), lowercase, unify quotes/dashes, collapse whitespace — for substring checks. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[•·▪●◦]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Hard boundaries a quote may not cross: blank lines, list bullets and U+2029
 * (used to separate fields of the structured resume). Only a single line break
 * inside a paragraph (a wrapped line in an extracted PDF) may be crossed.
 */
const SEGMENT_BREAK = /\n[^\S\n]*\n|\u2029|[•▪●◦]/

/** The quote as it is matched: normalised, without wrapping quotation marks, ellipses or end punctuation. */
export function normalizeQuote(quote: string): string {
  return normalizeForMatch(quote).replace(/^[\s"'.…-]+|[\s"'.…-]+$/g, '')
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * True when `quote` appears verbatim (after normalisation) inside a single
 * segment of `source`, starting and ending on word boundaries: "Excel" is not
 * found in "excellent", and a quote may not stitch two bullets or two resume
 * fields together. `source` may be given as separate segments.
 */
export function containsQuote(source: string | string[], quote: string): boolean {
  const q = normalizeQuote(quote)
  if (q.length < 3) return false
  const wordStart = WORD_CHAR.test(q[0])
  const wordEnd = WORD_CHAR.test(q[q.length - 1])
  const segments = (Array.isArray(source) ? source : [source]).flatMap(s => s.split(SEGMENT_BREAK))
  for (const segment of segments) {
    const text = normalizeForMatch(segment)
    for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + 1)) {
      const before = i > 0 ? text[i - 1] : ''
      const after = text[i + q.length] ?? ''
      if ((!wordStart || !WORD_CHAR.test(before)) && (!wordEnd || !WORD_CHAR.test(after))) return true
    }
  }
  return false
}

/** Lines of a document as separate quote segments (a quote may not span two lines). */
export const lineSegments = (text: string): string[] => text.split('\n')

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'with', 'or', 'by', 'as', 'is', 'are', 'be',
  'we', 'you', 'our', 'your', 'i', 'ii', 'iii', 'iv', '-', '&', '/', 'm', 'f', 'd', 'x',
])

export function tokens(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[^a-z0-9+#]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * Numbers that appear in generated text must appear in the sources (resume,
 * job description, preferences): "no metrics may be invented".
 * Returns the numbers that could not be found.
 */
export function unsupportedNumbers(generated: string, sources: string[]): string[] {
  const corpus = sources.map(s => normalizeForMatch(s)).join(' \n ').replace(/,/g, '')
  const found = normalizeForMatch(generated).match(/\d[\d,.]*\s*%?/g) ?? []
  const missing = new Set<string>()
  for (const raw of found) {
    const n = raw.replace(/,/g, '').replace(/\.$/, '').trim()
    const digits = n.replace(/\s*%$/, '')
    if (!digits || digits.length === 0) continue
    // Tolerate single digits used as ordinary words ("2 years" still needs support below).
    const pattern = new RegExp(`(^|[^0-9.])${digits.replace(/\./g, '\\.')}(?![0-9])`)
    if (!pattern.test(corpus)) missing.add(n)
  }
  return [...missing]
}
