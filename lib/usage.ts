import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Simple rolling-window rate limits for metered actions (AI calls).
// Uses the service-role client: usage_events is not visible to users.

export const LIMITS = {
  resume_parse: { max: 10, windowHours: 24 },
} as const

export type UsageKind = keyof typeof LIMITS

export async function isOverLimit(admin: SupabaseClient, userId: string, kind: UsageKind): Promise<boolean> {
  const { max, windowHours } = LIMITS[kind]
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString()
  const { count, error } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', since)
  if (error) throw error
  return (count ?? 0) >= max
}

export async function recordUsage(admin: SupabaseClient, userId: string, kind: UsageKind): Promise<void> {
  const { error } = await admin.from('usage_events').insert({ user_id: userId, kind })
  if (error) throw error
}
