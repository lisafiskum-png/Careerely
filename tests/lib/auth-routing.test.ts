import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  refresh: false,
  getUser: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onboardingPath: '/dashboard' as '/dashboard' | '/onboarding/2',
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string; options: { path: string } }[]) => void }
  }) => ({ auth: { getUser: mocks.getUser.mockImplementation(async () => {
    if (mocks.refresh) options.cookies.setAll([{ name: 'refreshed-session', value: 'new-token', options: { path: '/' } }])
    return { data: { user: mocks.user } }
  }) } }),
}))
vi.mock('../../lib/supabase/server', () => ({ createClient: async () => ({ auth: {
  verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession,
} }) }))
vi.mock('../../lib/auth', () => ({ getUser: async () => mocks.user }))
vi.mock('../../lib/onboarding-server', () => ({ getOnboardingPath: async () => mocks.onboardingPath }))
vi.mock('../../lib/dashboard', () => ({
  DASHBOARD_SHORTLIST_ROWS: 3,
  getAccount: async () => ({ firstName: null, lastName: null, access: { kind: 'read_only' } }),
  getLiveOpportunities: async () => ({ list: [] }),
  getScanStatus: async () => ({ state: 'idle', lastScanAt: null }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../app/login/login-form', () => ({ LoginForm: () => null }))
vi.mock('../../app/(app)/_components/live-refresh', () => ({ LiveRefresh: () => null }))
vi.mock('../../app/(app)/_components/top-nav', () => ({ TopNav: () => null }))

import { proxy } from '../../proxy'
import { GET, POST } from '../../app/auth/confirm/route'
import EmailActionPage from '../../app/auth/email-action/page'
import LoginPage from '../../app/login/page'
import AppLayout from '../../app/(app)/layout'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  mocks.user = null
  mocks.refresh = false
  mocks.onboardingPath = '/dashboard'
  vi.clearAllMocks()
  mocks.verifyOtp.mockResolvedValue({ error: null })
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
})

describe('existing and new account routing', () => {
  it('always shows the credential form at /login, even when another account has an active session', async () => {
    mocks.user = { id: 'existing-user', email: 'alex@example.test' }
    mocks.refresh = true
    const response = await proxy(new NextRequest('https://careerely.test/login?next=/dashboard'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get('refreshed-session')).toBeUndefined()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('renders the landing page without waiting for Supabase Auth', async () => {
    const response = await proxy(new NextRequest('https://careerely.test/'))
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('keeps signup out of an existing session', async () => {
    mocks.user = { id: 'existing-user', email: 'alex@example.test' }
    const response = await proxy(new NextRequest('https://careerely.test/signup'))
    expect(response.headers.get('location')).toBe('https://careerely.test/dashboard')
  })

  it.each(['/login', '/signup'])('leaves signed-out visitors on their chosen account page %s', async path => {
    const response = await proxy(new NextRequest(`https://careerely.test${path}`))
    expect(response.headers.get('location')).toBeNull()
  })

  it('protects dashboard and retains the requested destination', async () => {
    const response = await proxy(new NextRequest('https://careerely.test/applications'))
    expect(response.headers.get('location')).toBe('https://careerely.test/login?next=%2Fapplications')
  })

  it.each([undefined, 'https://evil.test', '//evil.test'])('defaults login to dashboard for missing or unsafe destinations: %s', async next => {
    const page = await LoginPage({ searchParams: Promise.resolve({ next }) })
    const form = page.props.children as ReactElement<{ next: string }>
    expect(form.props.next).toBe('/dashboard')
  })

  it('preserves a protected-page destination after login', async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({ next: '/applications' }) })
    expect((page.props.children as ReactElement<{ next: string }>).props.next).toBe('/applications')
  })

  it('allows a signed-in user with missing profile fields into the app shell', async () => {
    mocks.user = { id: 'existing-user', email: 'alex@example.test' }
    const page = await AppLayout({ children: 'dashboard content' })
    expect(page).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('keeps signed-out users out of the app shell', async () => {
    await expect(AppLayout({ children: 'private content' })).rejects.toThrow('redirect:/login?next=/dashboard')
  })

  it('keeps an unpaid or unfinished account out of the dashboard', async () => {
    mocks.user = { id: 'unfinished-user', email: 'new@example.test' }
    mocks.onboardingPath = '/onboarding/2'
    await expect(AppLayout({ children: 'private content' })).rejects.toThrow('redirect:/onboarding/2')
  })
})

describe('auth email destinations', () => {
  it.each([
    ['', '/dashboard'],
    ['&next=https://evil.test', '/dashboard'],
    ['&next=/onboarding/2', '/onboarding/2'],
    ['&next=/applications', '/applications'],
  ])('uses the safe destination after verification: %s', async (query, destination) => {
    const response = await GET(new NextRequest(`https://careerely.test/auth/confirm?code=valid${query}`))
    expect(response.headers.get('location')).toBe(`https://careerely.test${destination}`)
  })

  it('keeps recovery links in password reset', async () => {
    const response = await GET(new NextRequest('https://careerely.test/auth/confirm?token_hash=valid&type=recovery'))
    expect(response.headers.get('location')).toBe('https://careerely.test/reset-password')
  })

  it('returns failed verification to login with an explanatory notice', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error('expired') })
    const response = await GET(new NextRequest('https://careerely.test/auth/confirm?token_hash=expired&type=signup'))
    expect(response.headers.get('location')).toBe('https://careerely.test/login?notice=link_invalid')
  })

  it('does not consume recovery tokens when an email scanner opens the landing page', async () => {
    const html = renderToStaticMarkup(await EmailActionPage({
      searchParams: Promise.resolve({ token_hash: 'single-use-token', type: 'recovery', next: '/reset-password' }),
    }))

    expect(html).toContain('Continue to reset password')
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/auth/confirm"')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('consumes a recovery token only after the user submits the interstitial', async () => {
    const response = await POST(new NextRequest('https://careerely.test/auth/confirm', {
      method: 'POST',
      body: new URLSearchParams({ token_hash: 'single-use-token', type: 'recovery', next: '/reset-password' }),
    }))

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'single-use-token', type: 'recovery' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://careerely.test/reset-password')
  })

  it('confirms email through the same scanner-safe POST and keeps a safe destination', async () => {
    const response = await POST(new NextRequest('https://careerely.test/auth/confirm', {
      method: 'POST',
      body: new URLSearchParams({ token_hash: 'single-use-token', type: 'email', next: '/onboarding/2' }),
    }))

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'single-use-token', type: 'email' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://careerely.test/onboarding/2')
  })

  it('keeps invalid POSTed tokens on a recoverable email-link screen', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error('expired') })
    const response = await POST(new NextRequest('https://careerely.test/auth/confirm', {
      method: 'POST',
      body: new URLSearchParams({ token_hash: 'expired', type: 'recovery' }),
    }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://careerely.test/auth/email-action?error=link_invalid&type=recovery')
  })
})
