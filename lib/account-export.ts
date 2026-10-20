import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const OWNED_TABLES = [
  'profiles',
  'subscriptions',
  'career_profiles',
  'searches',
  'search_runs',
  'opportunities',
  'evidence',
  'rejections',
  'application_packages',
  'applications',
  'activity',
  'behavioral_signals',
] as const

type ExportRows = Record<(typeof OWNED_TABLES)[number] | 'jobs', unknown[]>

/**
 * Builds a portable JSON export using the signed-in Supabase client. Row-level
 * security is the final boundary: even if a filter is changed later, this
 * client can only read data belonging to the current user.
 */
export async function buildAccountExport(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; created_at?: string },
) {
  const rows = {} as ExportRows

  for (const table of OWNED_TABLES) {
    const query = supabase.from(table).select('*')
    const { data, error } = table === 'profiles' ? await query.eq('id', user.id) : await query.eq('user_id', user.id)
    if (error) throw new Error(`Could not export ${table}: ${error.message}`)
    rows[table] = data ?? []
  }

  const jobIds = new Set<string>()
  for (const row of [...rows.opportunities, ...rows.applications, ...rows.rejections] as Array<{ job_id?: string | null }>) {
    if (row.job_id) jobIds.add(row.job_id)
  }

  if (jobIds.size) {
    const { data, error } = await supabase.from('jobs').select('*').in('id', [...jobIds])
    if (error) throw new Error(`Could not export jobs: ${error.message}`)
    rows.jobs = data ?? []
  } else {
    rows.jobs = []
  }

  // Stripe's internal customer/subscription identifiers are operational data,
  // not useful in a portable user export. Billing status and periods remain.
  rows.subscriptions = rows.subscriptions.map(row => {
    const portable = { ...(row as Record<string, unknown>) }
    delete portable.stripe_customer_id
    delete portable.stripe_subscription_id
    return portable
  })

  return {
    format: 'careerely-account-export',
    version: 1,
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at ?? null,
    },
    data: rows,
  }
}
