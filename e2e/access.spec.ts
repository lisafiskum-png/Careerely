import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Phase D7: every signed-in action enforces the same rules — the signed-in
// user's own data only (another user's rows are "not found" and unchanged),
// read-only accounts get one consistent 403 { code: 'read_only' } on writes
// while reading and documents stay available, and signed-out requests get 401.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stamp = Date.now()
const ownerEmail = `access-a+${stamp}@example.com`
const otherEmail = `access-b+${stamp}@example.com`
const readOnlyEmail = `access-ro+${stamp}@example.com`
type Seed = Awaited<ReturnType<typeof seedDashboardUser>>
let owner: Seed
let other: Seed
let readOnly: Seed
let ownerSearch: string
let readOnlySearch: string

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

const searchBody = { name: 'Access check', targetRoles: ['Sales Manager'], workStyles: ['remote'] }

/** Every signed-in write, aimed at the given user's rows. */
function writes(r: APIRequestContext, s: Seed, searchId: string) {
  return {
    dismiss: () => r.post(`/api/opportunities/${s.opportunities.criteo}/dismiss`, { data: { reason: 'role' } }),
    applied: () => r.post(`/api/applications/${s.applications.stripe}/applied`),
    status: () => r.post(`/api/applications/${s.applications.ramp}/status`, { data: { outcome: 'withdrawn' } }),
    editSearch: () => r.patch(`/api/searches/${searchId}`, { data: searchBody }),
    pauseSearch: () => r.post(`/api/searches/${searchId}/status`, { data: { status: 'paused' } }),
  }
}

async function snapshot(s: Seed) {
  const [opps, apps, searches] = await Promise.all([
    admin.from('opportunities').select('id, dismissed_at, dismiss_reason').eq('user_id', s.userId).order('id'),
    admin.from('applications').select('id, status, outcome, applied_at').eq('user_id', s.userId).order('id'),
    admin.from('searches').select('id, name, status').eq('user_id', s.userId).order('id'),
  ])
  return { opps: opps.data, apps: apps.data, searches: searches.data }
}

test.describe.serial('access rules across signed-in actions', () => {
  test.beforeAll(async () => {
    owner = await seedDashboardUser(admin, { email: ownerEmail, firstName: 'Lisa' })
    other = await seedDashboardUser(admin, { email: otherEmail, firstName: 'Lisa' })
    readOnly = await seedDashboardUser(admin, { email: readOnlyEmail, firstName: 'Lisa', readOnly: true })
    ownerSearch = (await admin.from('searches').select('id').eq('user_id', owner.userId).single()).data!.id
    readOnlySearch = (await admin.from('searches').select('id').eq('user_id', readOnly.userId).single()).data!.id
    // The Ramp application must be submitted for a status change to apply.
    for (const s of [owner, readOnly]) {
      await admin.from('applications').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', s.applications.ramp)
    }
  })
  test.afterAll(async () => {
    for (const s of [owner, other, readOnly]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test("another user's data is not found and never changed", async ({ page }) => {
    const before = await snapshot(owner)
    await signIn(page, otherEmail)
    const r = page.request
    for (const [name, call] of Object.entries(writes(r, owner, ownerSearch))) {
      expect((await call()).status(), name).toBe(404)
    }
    expect((await r.get(`/api/opportunities/${owner.opportunities.stripe}`)).status()).toBe(404)
    expect((await r.get(`/api/opportunities/${owner.opportunities.stripe}/documents/resume`)).status()).toBe(404)
    expect(await snapshot(owner)).toEqual(before)
  })

  test('read-only: one consistent 403 for every write; reading and documents still work', async ({ page }) => {
    const before = await snapshot(readOnly)
    await signIn(page, readOnlyEmail)
    const r = page.request
    const calls = {
      ...writes(r, readOnly, readOnlySearch),
      createSearch: () => r.post('/api/searches', { data: { ...searchBody, status: 'paused' } }),
      resumeSearch: () => r.post(`/api/searches/${readOnlySearch}/status`, { data: { status: 'active' } }),
      dismissNotice: () => r.delete('/api/searches/plan-change-notice'),
    }
    for (const [name, call] of Object.entries(calls)) {
      const res = await call()
      expect(res.status(), name).toBe(403)
      expect(await res.json(), name).toEqual({ error: 'Your account is read-only.', code: 'read_only' })
    }
    expect(await snapshot(readOnly)).toEqual(before)
    expect((await r.get(`/api/opportunities/${readOnly.opportunities.stripe}`)).status()).toBe(200)
    const pdf = await r.get(`/api/opportunities/${readOnly.opportunities.stripe}/documents/cover-letter`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
  })

  test('the owner can do each action, and the result shows on the other pages', async ({ page }) => {
    await signIn(page, ownerEmail)
    const r = page.request
    const w = writes(r, owner, ownerSearch)
    for (const [name, call] of Object.entries(w)) expect((await call()).status(), name).toBe(200)

    // Applying moved Stripe out of Ready to apply: the nav badge and pages agree.
    await page.goto('/applications')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: /^Applications/ })).not.toContainText(/\d/)
    await expect(page.getByTestId('ready-card')).toHaveCount(0)
    await expect(page.getByTestId('app-row').filter({ hasText: 'Stripe' }).getByTestId('status-pill')).toHaveText('Applied')
    await expect(page.getByTestId('app-row').filter({ hasText: 'Ramp' }).getByTestId('status-pill')).toHaveText('Withdrawn')
    await page.goto('/opportunities')
    await expect(page.getByText('Criteo')).toHaveCount(0)
    await page.goto('/dashboard')
    const activity = page.getByRole('region', { name: 'Recent activity' })
    await activity.scrollIntoViewIfNeeded()
    await expect(activity).toContainText('You applied to Stripe')
    await page.goto('/searches')
    await expect(page.getByTestId('search-card').first().getByTestId('search-status')).toHaveText('Paused')
    await expect(page.getByRole('heading', { name: 'Access check' })).toBeVisible()
  })

  test('a failed "Not for me" says so and changes nothing', async ({ page }) => {
    await signIn(page, ownerEmail)
    await page.goto('/opportunities')
    await page.route(/\/api\/opportunities\/[^/]+\/dismiss$/, route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' }))
    const row = page.getByTestId('op-row').filter({ hasText: 'Shopify' })
    await row.getByRole('button', { name: 'Not for me' }).click()
    await page.getByTestId('dismiss-prompt').getByRole('button', { name: 'Dismiss without a reason' }).click()
    await expect(page.getByTestId('dismiss-error')).toHaveText('Couldn’t dismiss this opportunity. Please try again.')
    await expect(row).toBeVisible()
    expect((await admin.from('opportunities').select('dismissed_at').eq('id', owner.opportunities.shopify).single()).data!.dismissed_at).toBeNull()
  })

  test('signed-out requests are rejected everywhere', async ({ request }) => {
    for (const [name, call] of Object.entries(writes(request, owner, ownerSearch))) {
      expect((await call()).status(), name).toBe(401)
    }
    expect((await request.post('/api/searches', { data: searchBody })).status()).toBe(401)
    expect((await request.delete('/api/searches/plan-change-notice')).status()).toBe(401)
    expect((await request.post('/api/billing/portal')).status()).toBe(401)
  })
})
