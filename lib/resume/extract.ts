import 'server-only'

// Turns an uploaded resume into plain text. PDF, DOCX and legacy DOC are
// supported (Step 2 accepts "PDF, DOC or DOCX · Max 10MB").

export type ResumeFileKind = 'pdf' | 'docx' | 'doc'

export const MAX_RESUME_BYTES = 10 * 1024 * 1024
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
const MAX_DOCX_ENTRIES = 1_000

function uint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/**
 * Validates the ZIP directory before Mammoth expands a DOCX. This rejects
 * generic/encrypted ZIP files, path traversal and containers whose advertised
 * expanded size or entry count could exhaust a serverless function.
 */
export function assertSafeDocx(bytes: Uint8Array): void {
  const decoder = new TextDecoder()
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (uint32(bytes, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid DOCX container')

  const entryCount = uint16(bytes, eocd + 10)
  const directorySize = uint32(bytes, eocd + 12)
  const directoryOffset = uint32(bytes, eocd + 16)
  if (!entryCount || entryCount > MAX_DOCX_ENTRIES || directoryOffset + directorySize > bytes.length) {
    throw new Error('Unsafe DOCX container')
  }

  let offset = directoryOffset
  let expandedBytes = 0
  let compressedBytes = 0
  let hasContentTypes = false
  let hasDocument = false

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || uint32(bytes, offset) !== 0x02014b50) throw new Error('Invalid DOCX directory')
    const flags = uint16(bytes, offset + 8)
    const compressedSize = uint32(bytes, offset + 20)
    const uncompressedSize = uint32(bytes, offset + 24)
    const nameLength = uint16(bytes, offset + 28)
    const extraLength = uint16(bytes, offset + 30)
    const commentLength = uint16(bytes, offset + 32)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > bytes.length || (flags & 1) !== 0) throw new Error('Unsafe DOCX container')

    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replaceAll('\\', '/')
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('Unsafe DOCX path')
    if (name === '[Content_Types].xml') hasContentTypes = true
    if (name === 'word/document.xml') hasDocument = true

    expandedBytes += uncompressedSize
    compressedBytes += compressedSize
    if (expandedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) throw new Error('DOCX expands beyond the safe limit')
    offset = next
  }

  if (!hasContentTypes || !hasDocument) throw new Error('This ZIP file is not a DOCX resume')
  if (compressedBytes > 0 && expandedBytes / compressedBytes > 200) throw new Error('DOCX compression ratio is unsafe')
}

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
    assertSafeDocx(bytes)
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
