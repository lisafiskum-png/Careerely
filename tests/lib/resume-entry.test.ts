import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  user: { id: 'candidate-1' } as { id: string } | null,
  completed: null as string | null,
  error: null as unknown,
  from: vi.fn(),
}))
vi.mock('../../lib/auth', () => ({ getUser: async () => mocks.user }))
vi.mock('../../lib/supabase/server', () => ({ createClient: async () => ({
  from: mocks.from.mockImplementation((table: string) => {
    // This unfinished account can have old saved CV data. Entry must never
    // read it back into the review state on a fresh onboarding visit.
    expect(table).toBe('profiles')
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { onboarding_completed_at: mocks.completed }, error: mocks.error }) }
    return query
  }),
}) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) } }))
vi.mock('../../app/onboarding/2/resume-step', () => ({ ResumeStep: () => null }))
import ResumePage from '../../app/onboarding/2/page'

beforeEach(() => {
  mocks.user = { id: 'candidate-1' }
  mocks.completed = null
  mocks.error = null
  vi.clearAllMocks()
})

describe('fresh onboarding resume entry', () => {
  it('starts unfinished accounts at upload, without reopening any saved draft', async () => {
    const page = await ResumePage()
    expect((page.props.children as ReactElement<{ draft: unknown }>).props.draft).toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
  it('sends completed accounts to the dashboard', async () => {
    mocks.completed = '2026-10-01T12:00:00Z'
    await expect(ResumePage()).rejects.toThrow('redirect:/dashboard')
  })
  it('requires credentials for signed-out visitors', async () => {
    mocks.user = null
    await expect(ResumePage()).rejects.toThrow('redirect:/login?next=/onboarding/2')
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('does not misclassify a database outage as unfinished onboarding', async () => {
    mocks.error = new Error('database unavailable')
    await expect(ResumePage()).rejects.toThrow('database unavailable')
  })
})
