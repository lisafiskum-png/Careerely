import 'server-only'

// Master Brief → Tech stack. Overridable per environment without a deploy.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
