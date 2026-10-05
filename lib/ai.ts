import 'server-only'
import Anthropic, { type APIError } from '@anthropic-ai/sdk'
import { env } from './env'

// Master Brief → Tech stack. Overridable per environment without a deploy.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

export const AI_REQUEST_TIMEOUT_MS = 60_000

/** Preserve retry classification without persisting provider response bodies. */
export class AIRequestError extends Error {
  readonly retriable: boolean
  readonly status: number | undefined

  constructor(error: APIError) {
    super(`AI unavailable (${error.status ?? 'connection'}).`)
    this.name = 'AIRequestError'
    this.status = error.status
    this.retriable = error.status === undefined || [408, 409, 429].includes(error.status) || error.status >= 500
  }
}

let client: Anthropic | null = null

// Created lazily so a missing key fails the request, not the build.
// ANTHROPIC_BASE_URL is honoured by the SDK (used by the local test harness).
export function getAnthropic(): Anthropic {
  // The queue owns retries; SDK retries can outlive the serverless invocation.
  client ??= new Anthropic({ apiKey: env.anthropicApiKey(), timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 0 })
  return client
}
