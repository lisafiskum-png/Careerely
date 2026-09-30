import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { env } from '../env'

// Service-role client. Bypasses row level security: use only in trusted
// server code (Stripe webhook, Opportunity Engine), never with user input as
// the source of a user id.
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
