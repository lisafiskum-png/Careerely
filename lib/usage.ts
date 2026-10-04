import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Rolling-window rate limits for metered actions (AI calls). The database RPC
// serializes claims per user/kind, so parallel requests cannot all pass the
// same count check and overspend the allowance.

export const LIMITS = {
  resume_parse: { max: 10, windowHours: 24 },
} as const

export type UsageKind = keyof typeof LIMITS

/** Atomically consumes one allowance slot. False means the rolling limit is full. */
export async function claimUsage(admin: SupabaseClient, userId: string, kind: UsageKind): Promise<boolean> {
  const { max, windowHours } = LIMITS[kind]
  const { data, error } = await admin.rpc('claim_usage_event', {
    p_user: userId,
    p_kind: kind,
    p_max: max,
    p_window_hours: windowHours,
  })
  if (error) throw error
  return data === true
}
