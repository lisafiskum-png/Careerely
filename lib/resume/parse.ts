import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { CLAUDE_MODEL, getAnthropic } from '../ai'
import { normalizeResume, normalizeSuggestions, ParseResultSchema, type ParseResult } from './schema'

export class ResumeParseError extends Error {}

const INSTRUCTIONS = `You extract structured data from a candidate's resume for Careerely, an AI career agent.

Rules:
- Copy facts from the resume only. Never invent employers, titles, dates, numbers, skills or contact details.
- If a value is not in the resume, use an empty string or an empty list.
- Keep the candidate's own wording for experience highlights (one bullet per item, no rewriting or embellishing).
- Dates: keep them as written in the resume (e.g. "Jan 2021", "2019"). For a current role set current=true and end="".
- links: URLs from the resume (LinkedIn, portfolio, GitHub).

Suggestions (used to pre-fill the candidate's search; they will review and edit them):
- roles: up to 3 job titles this candidate is a credible fit for next, based on their experience and any stated goals in the resume.
- industries: up to 5 industries or domains the resume shows experience or clear interest in.
- highlights: exactly 3 very short phrases (max 6 words each) summarising what the resume shows, e.g. "Sales & BD experience found". Each must be directly supported by the resume.`

/**
 * Parses resume text with Claude into the structured resume and Step 3
 * suggestions. When the text layer is empty (e.g. a scanned PDF), the PDF
 * itself is sent so Claude can read it.
 */
export async function parseResume(input: { text: string; pdf?: Uint8Array }): Promise<ParseResult> {
  const content: Anthropic.ContentBlockParam[] = []
  if (input.pdf && input.text.length < 200) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(input.pdf).toString('base64') },
    })
    content.push({ type: 'text', text: 'Extract the resume in the attached document.' })
  } else {
    content.push({ type: 'text', text: `<resume>\n${input.text.slice(0, 60_000)}\n</resume>` })
  }

  let response
  try {
    response = await getAnthropic().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: INSTRUCTIONS,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(ParseResultSchema) },
    })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('resume parse: Claude API error', err.status, err.message)
      throw new ResumeParseError('We couldn’t read your resume right now. Please try again in a moment.')
    }
    throw err
  }

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
    console.error('resume parse: unusable response', response.stop_reason)
    throw new ResumeParseError('We couldn’t read this resume. Try another file, or a PDF export.')
  }

  const { resume, suggestions } = response.parsed_output
  return { resume: normalizeResume(resume), suggestions: normalizeSuggestions(suggestions) }
}
