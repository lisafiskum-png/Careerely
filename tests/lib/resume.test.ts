import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { normalizeResume, normalizeSuggestions, type Resume } from '../../lib/resume/schema'

vi.mock('server-only', () => ({}))
const { detectResumeKind, extractResumeText, normalizeWhitespace } = await import('../../lib/resume/extract')

const base: Resume = {
  full_name: ' Lisa Fiskum ',
  headline: 'AML compliance professional',
  email: 'lisa@example.com',
  phone: '',
  location: 'Oslo, Norway',
  links: [],
  summary: '',
  experience: [
    { title: 'AML Analyst', company: 'Nordic Bank', location: '', start: '2021', end: '2024', current: true, highlights: ['Led crypto due diligence', '', '  '] },
  ],
  education: [],
  skills: ['KYC', 'kyc', ' AML '],
  languages: [],
  certifications: [],
}

describe('normalizeResume', () => {
  it('trims values, drops empty bullets, dedupes skills, clears end date for current roles', () => {
    const r = normalizeResume(base)
    expect(r.full_name).toBe('Lisa Fiskum')
    expect(r.experience[0].highlights).toEqual(['Led crypto due diligence'])
    expect(r.experience[0].end).toBe('')
    expect(r.skills).toEqual(['KYC', 'AML'])
  })
})

describe('normalizeSuggestions', () => {
  it('enforces the Step 3 limits (3 roles, 5 industries, 3 highlights)', () => {
    const s = normalizeSuggestions({
      roles: ['A', 'B', 'C', 'D'],
      industries: ['1', '2', '3', '4', '5', '6'],
      highlights: ['x', 'y', 'z', 'w'],
    })
    expect(s.roles).toHaveLength(3)
    expect(s.industries).toHaveLength(5)
    expect(s.highlights).toHaveLength(3)
  })
})

async function makeDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  )
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}

describe('resume files', () => {
  it('detects file types from content, not names', async () => {
    const pdf = new Uint8Array(new jsPDF().output('arraybuffer'))
    expect(detectResumeKind(pdf)).toBe('pdf')
    expect(detectResumeKind(await makeDocx('hi'))).toBe('docx')
    expect(detectResumeKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe('doc')
    expect(detectResumeKind(new TextEncoder().encode('<html>'))).toBeNull()
  })

  it('extracts text from a PDF', async () => {
    const doc = new jsPDF()
    doc.text('Lisa Fiskum — AML Analyst at Nordic Bank', 10, 10)
    const text = await extractResumeText(new Uint8Array(doc.output('arraybuffer')), 'pdf')
    expect(text).toContain('Lisa Fiskum')
    expect(text).toContain('Nordic Bank')
  })

  it('extracts text from a DOCX', async () => {
    const text = await extractResumeText(await makeDocx('Business development at Nordic Bank'), 'docx')
    expect(text).toBe('Business development at Nordic Bank')
  })

  it('normalises whitespace', () => {
    expect(normalizeWhitespace('a  \t b\r\n\r\n\r\n\nc ')).toBe('a b\n\nc')
  })
})
