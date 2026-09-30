import { createBrowserClient } from '@supabase/ssr'

// Browser client. The session lives in cookies so the server (route handlers,
// server components and proxy.ts) can read it too.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
