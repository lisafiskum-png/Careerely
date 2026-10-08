export const AUTH_UNAVAILABLE = 'We couldn’t connect to the sign-in service. Please try again.'

/** Never confuse an outage or rate limit with incorrect credentials. */
export function authErrorMessage(error: unknown, fallback: string): string {
  const issue = error as { status?: number; code?: string; name?: string } | null
  if (issue?.status === 429 || issue?.code === 'over_request_rate_limit' || issue?.code === 'over_email_send_rate_limit') {
    return 'Too many requests. Please wait a minute and try again.'
  }
  if (!issue?.status || issue.status >= 500 || issue.name === 'AuthRetryableFetchError') return AUTH_UNAVAILABLE
  if (issue.code === 'email_not_confirmed') return 'Please confirm your email first. Check your inbox for the confirmation link.'
  return fallback
}
