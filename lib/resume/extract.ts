import 'server-only'

// Turns an uploaded resume into plain text. PDF, DOCX and legacy DOC are
// supported (Step 2 accepts "PDF, DOC or DOCX · Max 10MB").

export type ResumeFileKind = 'pdf' | 'docx' | 'doc'

export const MAX_RESUME_BYTES = 10 * 1024 * 1024

/** Identifies the file by its content, not its name. */
export function detectResumeKind(bytes: Uint8Array): ResumeFileKind | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'pdf' // %PDF
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return 'docx' // ZIP container
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc' // OLE2
  return null
}

export async function extractResumeText(bytes: Uint8Array, kind: ResumeFileKind): Promise<string> {
  let text = ''
  if (kind === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    text = (await extractText(pdf, { mergePages: true })).text
  } else if (kind === 'docx') {
    const mammoth = await import('mammoth')
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value
  } else {
    const { default: WordExtractor } = await import('word-extractor')
    const doc = await new WordExtractor().extract(Buffer.from(bytes))
    text = doc.getBody()
  }
  return normalizeWhitespace(text)
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
