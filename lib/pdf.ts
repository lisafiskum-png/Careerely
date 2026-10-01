import 'server-only'
import { jsPDF } from 'jspdf'

// Plain, ATS-friendly PDFs of a prepared resume or cover letter (launch
// decision: PDF only). Text is exactly the stored package text.

// The built-in PDF font covers Windows-1252 (Western European, incl. ø æ å é ü
// and typographic quotes/dashes). Other characters are transliterated where
// Unicode allows (ł → l is not decomposable, so it is mapped explicitly).
const WIN1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''))
const EXPLICIT: Record<string, string> = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', ß: 'ss', '‐': '-', '‑': '-', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ' }

export function toPdfText(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0)!
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN1252_EXTRA.has(ch)) out += ch
    else if (EXPLICIT[ch]) out += EXPLICIT[ch]
    else {
      const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
      out += /^[\x20-\x7e\xa0-\xff]+$/.test(base) ? base : '?'
    }
  }
  return out
}

export function renderTextPdf(opts: { title: string; body: string }): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 56
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const bottom = doc.internal.pageSize.getHeight() - margin
  const lineHeight = 15
  let y = margin

  doc.setProperties({ title: toPdfText(opts.title) })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  for (const paragraph of toPdfText(opts.body).split('\n')) {
    const lines: string[] = paragraph.trim() ? doc.splitTextToSize(paragraph, width) : ['']
    for (const line of lines) {
      if (y + lineHeight > bottom) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += lineHeight
    }
  }
  return doc.output('arraybuffer')
}
