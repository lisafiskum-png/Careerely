import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyBoard } from './companies'
import { fetchBoard } from './sources'

// Syncs one company board into public.jobs (shared across users).
// Postings still listed are upserted and marked active; postings that are no
// longer listed are marked inactive (Stage 1 treats them as expired). A failed
// fetch changes nothing, so a flaky board never expires its jobs.

export type SyncResult = { board: string; fetched: number; deactivated: number }

// Job descriptions can be large. Keeping PostgREST writes small avoids a
// single slow company board exhausting the database statement timeout.
export const JOB_WRITE_BATCH_SIZE = 50

export async function syncBoard(admin: SupabaseClient, board: CompanyBoard, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const jobs = await fetchBoard(board, fetchImpl)
  const now = new Date().toISOString()

  for (let i = 0; i < jobs.length; i += JOB_WRITE_BATCH_SIZE) {
    const chunk = jobs.slice(i, i + JOB_WRITE_BATCH_SIZE).map(j => ({ ...j, is_active: true, last_seen_at: now }))
    const { error } = await admin.from('jobs').upsert(chunk, { onConflict: 'source,source_job_id' })
    if (error) throw error
  }

  const liveIds = new Set(jobs.map(j => j.source_job_id))
  const { data: known, error: knownError } = await admin
    .from('jobs')
    .select('id, source_job_id')
    .eq('source', board.provider)
    .eq('company_slug', board.slug)
    .eq('is_active', true)
  if (knownError) throw knownError

  const gone = (known ?? []).filter(j => !liveIds.has(j.source_job_id)).map(j => j.id)
  for (let i = 0; i < gone.length; i += JOB_WRITE_BATCH_SIZE) {
    const { error } = await admin.from('jobs').update({ is_active: false }).in('id', gone.slice(i, i + JOB_WRITE_BATCH_SIZE))
    if (error) throw error
  }

  return { board: `${board.provider}:${board.slug}`, fetched: jobs.length, deactivated: gone.length }
}
