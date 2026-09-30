import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from './env'

// Master Brief → Tech stack. Overridable per environment without a deploy.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

let client: Anthropic | null = null

// Created lazily so a missing key fails the request, not the build.
// ANTHROPIC_BASE_URL is honoured by the SDK (used by the local test harness).
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey() })
  return client
}
