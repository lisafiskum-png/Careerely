import 'server-only'

// Server-side environment. Read lazily so a missing variable fails the request
// that needs it (with a clear message) instead of failing the build.

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'https://careerely.ai',
}
