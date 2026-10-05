import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { finalizeRun } from '../../lib/engine/scan'

describe('scan finalization replay', () => {
  it('preserves a completed run when its downstream queue insertion needs a retry', async () => {
    const single = vi.fn().mockResolvedValue({ data: {
      id: 'run', user_id: 'user', search_id: 'search', status: 'succeeded',
      jobs_rejected: 12, new_opportunity_ids: ['opportunity'],
    }, error: null })
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }))
    const admin = { from } as unknown as SupabaseClient
    expect(await finalizeRun(admin, 'run')).toEqual({ userId: 'user', shortlisted: ['opportunity'] })
    expect(from).toHaveBeenCalledExactlyOnceWith('search_runs')
  })

  it('does not treat an unreadable candidate set as zero shortlisted jobs', async () => {
    const failure = new Error('candidate read failed')
    const admin = { from: (table: string) => ({ select: () => ({ eq: () => table === 'search_runs'
      ? { single: async () => ({ data: { id: 'run', status: 'running' }, error: null }) }
      : Promise.resolve({ data: null, error: failure }) }) }) } as unknown as SupabaseClient
    await expect(finalizeRun(admin, 'run')).rejects.toThrow('candidate read failed')
  })
})
