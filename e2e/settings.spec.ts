import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Settings and billing (Phase D6) against the real app, stripe-mock and seeded
// local data. Set SCREENSHOT_DIR to save desktop and mobile screenshots.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const shots = process.env.SCREENSHOT_DIR
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })
}

const stamp = Date.now()
const email = `settings+${stamp}@example.com`
const noPlanEmail = `settings-np+${stamp}@example.com`
const mobileEmail = `settings-m+${stamp}@example.com`
type Seed = Awaited<ReturnType<typeof seedDashboardUser>>
let seed: Seed
let noPlanSeed: Seed
let mobileSeed: Seed

const RENEWS = '2027-03-14T10:00:00Z'
const READ_ONLY = 'Your account is read-only: your applications and documents are still here.'

async function setSubscription(userId: string, row: Record<string, unknown>) {
  const { error } = await admin.from('subscriptions').update(row).eq('user_id', userId)
  if (error) throw error
}

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe.serial('settings', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
    await setSubscription(seed.userId, { stripe_customer_id: `cus_e2e_${stamp}`, stripe_subscription_id: `sub_e2e_${stamp}`, current_period_end: RENEWS, cancel_at_period_end: false, cancel_at: null })
    noPlanSeed = await seedDashboardUser(admin, { email: noPlanEmail, firstName: 'Lisa' })
    mobileSeed = await seedDashboardUser(admin, { email: mobileEmail, firstName: 'Lisa' })
    await setSubscription(mobileSeed.userId, { stripe_customer_id: `cus_e2e_m_${stamp}`, current_period_end: RENEWS, cancel_at: null })
  })
  test.afterAll(async () => {
    for (const s of [seed, noPlanSeed, mobileSeed]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('active plan: entitlements from the plan config, renewal date, email, no price', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('plan-name')).toHaveText('Pro · 5 active searches · 50 applications prepared a month')
    await expect(page.getByTestId('plan-status')).toHaveText('Renews on 14 March 2027')
    await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible()
    await expect(page.getByTestId('account-email')).toHaveText(email)
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText('$')
    await expect(page.getByText(/applications prepared this/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible()
    await expect(page.getByTestId('plan-change-notice')).toHaveCount(0)
    await page.waitForTimeout(500)
    await shot(page, 'settings-active')
  })

  test('Manage billing opens Stripe’s portal for the stored customer', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/settings')
    await page.route(/stripe\.me\/session\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Customer Portal (test)</h1>' }))
    const portal = page.waitForResponse(r => r.url().endsWith('/api/billing/portal'))
    await page.getByRole('button', { name: 'Manage billing' }).click()
    expect((await portal).status()).toBe(200)
    await expect(page).toHaveURL(/stripe\.me\/session\//)
    await expect(page.getByRole('heading', { name: 'Stripe Customer Portal (test)' })).toBeVisible()
  })

  test('cancelling: supports both Stripe representations and keeps full access until the end', async ({ page }) => {
    await setSubscription(seed.userId, { status: 'active', cancel_at_period_end: true, cancel_at: null })
    await signIn(page, email)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-status')).toHaveText('Ends on 14 March 2027. You keep full access until then.')
    await expect(page.getByTestId('plan-name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible()

    // Stripe Customer Portal can instead send cancel_at with cancel_at_period_end=false.
    await setSubscription(seed.userId, { status: 'active', cancel_at_period_end: false, cancel_at: RENEWS })
    await page.reload()
    await expect(page.getByTestId('plan-status')).toHaveText('Ends on 14 March 2027. You keep full access until then.')
    await page.goto('/searches')
    await expect(page.getByRole('button', { name: 'New search' })).toBeVisible()

    // Keep later serial tests independent.
    await setSubscription(seed.userId, { cancel_at: null })
  })

  test('past due: payment failed, access continues', async ({ page }) => {
    await setSubscription(seed.userId, { status: 'past_due', cancel_at_period_end: false, cancel_at: null })
    await signIn(page, email)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-status')).toHaveText('Payment failed. Update your payment method in Manage billing to keep your plan.')
    await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible()
    await expect(page.getByTestId('plan-status')).not.toContainText('read-only')
    await expect(page.getByRole('button', { name: /^(Basic|Pro|Max)/ })).toHaveCount(0)
    await page.waitForTimeout(400)
    await shot(page, 'settings-past-due', false)

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Choose a plan' })).toHaveCount(0)
    await page.goto('/searches')
    await expect(page.getByTestId('read-only-notice')).toHaveCount(0)
    await page.getByRole('button', { name: 'New search' }).click()
    const form = page.getByTestId('search-form')
    await form.getByLabel('Search name').fill('Past due still works')
    await form.getByRole('button', { name: 'Start search' }).click()
    await expect(form).toHaveCount(0)
    const { data: created } = await admin.from('searches').select('id, status').eq('user_id', seed.userId).eq('name', 'Past due still works').single()
    expect(created!.status).toBe('active')
    expect((await page.request.post(`/api/searches/${created!.id}/status`, { data: { status: 'paused' } })).status()).toBe(200)
    expect((await page.request.post(`/api/applications/${seed.applications.stripe}/applied`)).status()).toBe(200)
    expect((await admin.from('applications').select('status').eq('id', seed.applications.stripe).single()).data!.status).toBe('applied')
    await admin.from('searches').delete().eq('id', created!.id)
  })

  test('ended: read-only, end date, plan picker, and Manage billing for invoices', async ({ page }) => {
    await setSubscription(seed.userId, { status: 'canceled', current_period_end: '2026-09-20T00:00:00Z', cancel_at: null })
    await signIn(page, email)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-status')).toHaveText(`Your plan ended on 20 September 2026. ${READ_ONLY}`)
    await expect(page.getByTestId('plan-name')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pro/ })).toContainText('5 active searches · 50 applications prepared a month')
    await expect(page.getByRole('main')).not.toContainText('$')
    await expect(page.getByText('See your invoices and payment history in Stripe.')).toBeVisible()
    await page.goto('/searches')
    await expect(page.getByTestId('read-only-notice')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New search' })).toHaveCount(0)
    await page.goto('/settings')
    await page.waitForTimeout(400)
    await shot(page, 'settings-ended')
  })

  test('never subscribed: "No plan", no Manage billing', async ({ page, request }) => {
    await admin.from('subscriptions').delete().eq('user_id', noPlanSeed.userId)
    await signIn(page, noPlanEmail)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-status')).toHaveText('No plan')
    await expect(page.getByRole('button', { name: 'Manage billing' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Basic/ })).toBeVisible()
    const res = await page.request.post('/api/billing/portal', { data: { customer: `cus_e2e_${stamp}` } })
    expect(res.status()).toBe(404)
    await page.waitForTimeout(400)
    await shot(page, 'settings-no-plan', false)
    expect((await request.post('/api/billing/portal')).status()).toBe(401)
  })

  test('account deletion requires explicit confirmation and removes the user', async ({ page }) => {
    await signIn(page, noPlanEmail)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByText('This cannot be undone.')).toBeVisible()
    const confirm = page.getByLabel('Type DELETE to confirm')
    await confirm.fill('delete')
    await expect(page.getByRole('button', { name: 'Permanently delete' })).toBeDisabled()
    await confirm.fill('DELETE')
    await page.getByRole('button', { name: 'Permanently delete' }).click()
    await expect(page).toHaveURL(/\/$/)
    const { data } = await admin.auth.admin.getUserById(noPlanSeed.userId)
    expect(data.user).toBeNull()
  })

  test('searches paused by a plan change: named on Searches, noted on Settings; dismissing keeps them paused', async ({ page }) => {
    await setSubscription(seed.userId, { status: 'active', plan: 'basic', current_period_end: RENEWS, cancel_at_period_end: false, cancel_at: null })
    const { data: extra, error } = await admin
      .from('searches')
      .insert([
        { user_id: seed.userId, name: 'Fintech partnerships', status: 'paused', created_from_profile: false, target_roles: ['Partnerships Manager'], work_styles: ['remote'], paused_by_plan_change_at: new Date().toISOString() },
        { user_id: seed.userId, name: 'Paused by me', status: 'paused', created_from_profile: false, target_roles: ['Sales Manager'], work_styles: ['remote'], paused_by_plan_change_at: null },
      ])
      .select('id, name')
    if (error) throw error
    await signIn(page, email)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-name')).toHaveText('Basic · 1 active search · 10 applications prepared a month')
    await expect(page.getByTestId('plan-change-notice')).toHaveText('Careerely paused 1 search when your plan changed, to fit its active-search limit. Review it on Searches →')
    await page.waitForTimeout(400)
    await shot(page, 'settings-plan-change')
    await page.getByRole('link', { name: 'Review it on Searches →' }).click()
    await expect(page).toHaveURL(/\/searches$/)
    const banner = page.getByTestId('plan-change-banner')
    await expect(banner).toContainText('Careerely paused “Fintech partnerships” when your plan changed, to fit its active-search limit.')
    await expect(banner).not.toContainText('Paused by me')
    await expect(page.getByRole('link', { name: 'Manage plan →' })).toHaveAttribute('href', '/settings')
    await expect(page.getByText('Upgrade →')).toHaveCount(0)
    await page.waitForTimeout(600)
    await shot(page, 'searches-plan-change-banner')
    const fintech = extra!.find(s => s.name === 'Fintech partnerships')!
    const manual = extra!.find(s => s.name === 'Paused by me')!
    const searchRow = async (id: string) => (await admin.from('searches').select('status, paused_by_plan_change_at, updated_at').eq('id', id).single()).data!
    const before = await searchRow(fintech.id)
    await banner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(banner).toHaveCount(0)
    expect(await searchRow(fintech.id)).toEqual(before)
    expect(before.paused_by_plan_change_at).not.toBeNull()
    expect((await searchRow(manual.id)).paused_by_plan_change_at).toBeNull()
    expect((await admin.from('profiles').select('plan_change_notice_dismissed_at').eq('id', seed.userId).single()).data!.plan_change_notice_dismissed_at).not.toBeNull()
    await page.reload()
    await expect(page.getByTestId('plan-change-banner')).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-change-notice')).toHaveCount(0)

    await page.goto('/searches')
    const options = (name: string) => page.getByTestId('search-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: `Options for ${name}` })
    await options('Business Development Manager').click()
    await page.getByRole('menuitem', { name: 'Pause search' }).click()
    await expect(page.getByTestId('plan-bar')).toHaveText(/0 of 1/)
    await options('Fintech partnerships').click()
    await page.getByRole('menuitem', { name: 'Resume search' }).click()
    await expect(page.getByTestId('plan-bar')).toHaveText(/1 of 1/)
    expect(await searchRow(fintech.id)).toMatchObject({ status: 'active', paused_by_plan_change_at: null })
    expect(await searchRow(manual.id)).toMatchObject({ status: 'paused', paused_by_plan_change_at: null })
  })

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, mobileEmail)
    await page.goto('/settings')
    await expect(page.getByTestId('plan-status')).toHaveText('Renews on 14 March 2027')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.waitForTimeout(500)
    await shot(page, 'settings-mobile')
  })

  test('Sign out from Settings', async ({ page }) => {
    await signIn(page, mobileEmail)
    await page.goto('/settings')
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/)
  })
})
