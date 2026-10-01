import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Dashboard (Phase D1 + D2) against the real app and seeded local data.
// Set SCREENSHOT_DIR to save desktop and mobile screenshots.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const shots = process.env.SCREENSHOT_DIR
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })
}

const email = `dash+${Date.now()}@example.com`
const readOnlyEmail = `dash-ro+${Date.now()}@example.com`
let seed: Awaited<ReturnType<typeof seedDashboardUser>>
let readOnlySeed: Awaited<ReturnType<typeof seedDashboardUser>>
let mobileSeed: Awaited<ReturnType<typeof seedDashboardUser>>
const mobileEmail = `dash-m+${Date.now()}@example.com`

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe.serial('dashboard', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
    readOnlySeed = await seedDashboardUser(admin, { email: readOnlyEmail, firstName: 'Lisa', readOnly: true })
    mobileSeed = await seedDashboardUser(admin, { email: mobileEmail, firstName: 'Lisa' })
  })
  test.afterAll(async () => {
    for (const s of [seed, readOnlySeed, mobileSeed]) if (s) await admin.auth.admin.deleteUser(s.userId)
    // Seeded postings are shared rows; remove them so other suites see a clean jobs table.
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('shows stored data in the locked layout: stats, My Pick, shortlist, applications, activity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)

    await expect(page.getByText(/^GOOD (MORNING|AFTERNOON|EVENING), LISA\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /Here's what Careerely\s*found for you\./ })).toBeVisible()
    const stats = page.getByTestId('stat-line')
    await expect(stats).toContainText(/8\s*shortlisted/)
    await expect(stats).toContainText(/2\s*applications ready/)
    await expect(stats).toContainText(/4,393\s*reviewed in latest scan/)
    await expect(stats).toContainText(/last scan\s*3 min ago/)
    await expect(page.getByTestId('scan-status')).toHaveText(/Last scan 3 min ago/)

    // Nav: top bar. Opportunities badge = My Pick + visible rows (1 + 5), not all 8 live.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByText('Opportunities6')).toBeVisible()
    await expect(nav.getByText('Applications2')).toBeVisible()

    // My Pick: two evidence points, reasoning, large match number, no bar.
    const pick = page.getByTestId('my-pick')
    await expect(pick).toContainText('Stripe')
    await expect(pick).toContainText('Business Development Lead, Payments')
    await expect(pick).toContainText('Dublin, Ireland·Hybrid·$120k–$160k')
    await expect(pick.locator('.ev')).toHaveCount(2)
    await expect(pick).toContainText('Your AML due diligence work meets their compliance requirement')
    await expect(pick).toContainText('I’d start here because')
    await expect(pick.locator('.match-n')).toHaveText('86%')
    await expect(pick.locator('.match-bar')).toHaveCount(0)
    await expect(pick.getByRole('button', { name: 'Review application' })).toBeVisible()
    await expect(pick).toContainText('Resume tailored')
    await expect(pick).toContainText('Cover letter drafted')

    // Also shortlisted: a preview of at most 5 rows in stored rank order (7 more exist);
    // states kept distinct; only Shortlisted rows can be dismissed.
    const rows = page.getByTestId('shortlist-row')
    await expect(rows).toHaveCount(5)
    await expect(page.getByRole('region', { name: 'Also shortlisted' }).locator('.section-count')).toHaveText('(7)')
    await expect(rows.nth(4)).toContainText('Nubank')
    await expect(page.getByTestId('shortlist-row').filter({ hasText: 'Snowflake' })).toHaveCount(0)
    await expect(rows.nth(0)).toContainText('Ramp')
    await expect(rows.nth(0)).toContainText('Application ready')
    await expect(rows.nth(1)).toContainText('Cohere')
    await expect(rows.nth(1)).toContainText('Preparing application…')
    await expect(rows.nth(0).getByRole('button', { name: 'Not for me' })).toHaveCount(0)
    await expect(rows.nth(1).getByRole('button', { name: 'Not for me' })).toHaveCount(0)
    await expect(rows.nth(2).getByRole('button', { name: 'Not for me' })).toHaveCount(1)
    await expect(page.getByText('~5 min')).toHaveCount(0)

    // Applications ready and Recent activity.
    const apps = page.getByRole('region', { name: 'Applications ready' })
    await apps.scrollIntoViewIfNeeded()
    await expect(apps.locator('.app-row')).toHaveCount(2)
    await expect(apps).toContainText('Application complete')
    const activity = page.getByRole('region', { name: 'Recent activity' })
    await activity.scrollIntoViewIfNeeded()
    await expect(activity).toContainText('Reviewed 4,393 postings for “Business Development Manager”')
    await expect(activity).toContainText('Shortlisted 8 opportunities')
    await expect(activity).toContainText('Prepared an application for Stripe')

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1500)
    await shot(page, 'desktop-dashboard')
  })

  test('panel: Summary / Resume / Cover letter / The role, PDF download', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    await page.getByTestId('my-pick').getByRole('button', { name: 'Review application' }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.p-chips')).toContainText('Resume tailored')
    await expect(panel.locator('.p-chips')).toContainText('My pick')
    await expect(panel).toContainText('Why I picked this')
    await expect(panel).toContainText('From your resume: “Led due diligence on complex crypto cases”')
    await expect(panel).toContainText('My judgment')
    await expect(panel).toContainText('What Careerely changed')
    await expect(panel).toContainText('Brings your commercial exposure forward')
    await expect(panel).toContainText('Things I considered')
    await expect(panel).toContainText('I couldn’t confirm this from your resume: “Fluency in English”')
    // The panel sits above the sticky nav.
    await panel.getByRole('button', { name: 'Close' }).click({ trial: true })
    await page.waitForTimeout(500)
    await shot(page, 'desktop-panel-summary', false)

    await panel.getByRole('tab', { name: 'Resume' }).click()
    await expect(panel.locator('.doc-changed')).toContainText('working closely with commercial teams')
    await panel.getByRole('tab', { name: 'Cover letter' }).click()
    await expect(panel).toContainText('Stripe’s work on regulated payments is why I’m writing.')
    await panel.getByRole('tab', { name: 'The role' }).click()
    await expect(panel).toContainText('Experience with AML or financial compliance')

    await panel.getByRole('button', { name: 'More actions' }).click()
    await expect(panel.getByRole('menuitem', { name: 'Not for me' })).toHaveCount(0) // Ready can't be dismissed
    const href = await panel.getByRole('menuitem', { name: 'Download resume PDF' }).getAttribute('href')
    const pdf = await page.request.get(href!)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()

    // Preparing stays reviewable.
    await page.getByTestId('shortlist-row').filter({ hasText: 'Cohere' }).click()
    await expect(panel).toContainText('Preparing application…')
    await panel.getByRole('tab', { name: 'Resume' }).click()
    await expect(panel).toContainText('Preparing application…')
  })

  test('"Not for me": dismisses Shortlisted rows only, then offers an optional reason', async ({ page }) => {
    await signIn(page, email)
    const shopify = page.getByTestId('shortlist-row').filter({ hasText: 'Shopify' })
    await shopify.hover()
    await shopify.getByRole('button', { name: 'Not for me' }).click()
    await expect(shopify).toHaveCount(0)
    await expect(page.getByText('Why not?')).toBeVisible()
    await page.getByRole('button', { name: 'Location' }).click()
    await expect(page.getByText('Why not?')).toHaveCount(0)
    await expect(page.getByTestId('stat-line')).toContainText(/7\s*shortlisted/)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Opportunities6')).toBeVisible()
    // The next-ranked opportunity moves into the five-row preview; nothing else changes.
    await expect(page.getByTestId('shortlist-row')).toHaveCount(5)
    await expect(page.getByTestId('shortlist-row').nth(4)).toContainText('Snowflake')
    const { data: hidden } = await admin.from('opportunities').select('state, dismissed_at, rank').eq('id', seed.opportunities.databricks).single()
    expect(hidden).toMatchObject({ state: 'shortlisted', dismissed_at: null, rank: 8 })

    const { data } = await admin.from('opportunities').select('dismissed_at, dismiss_reason').eq('id', seed.opportunities.shopify).single()
    expect(data!.dismissed_at).not.toBeNull()
    expect(data!.dismiss_reason).toBe('location')

    // Preparing and Ready opportunities cannot be dismissed, even directly.
    for (const id of [seed.opportunities.cohere, seed.opportunities.ramp]) {
      const res = await page.request.post(`/api/opportunities/${id}/dismiss`, { data: {} })
      expect(res.status()).toBe(409)
    }
    await page.reload()
    await expect(page.getByTestId('shortlist-row').filter({ hasText: 'Shopify' })).toHaveCount(0)
  })

  test('"Continue to application" never marks Applied by itself; "Yes, I applied" does', async ({ page, context }) => {
    await signIn(page, email)
    await page.getByTestId('my-pick').getByRole('button', { name: 'Review application' }).click()
    const panel = page.getByRole('dialog')
    const popup = context.waitForEvent('page')
    await panel.getByRole('button', { name: 'Continue to application →' }).click()
    await (await popup).close()
    await expect(panel.getByText('Did you apply?')).toBeVisible()
    let { data: app } = await admin.from('applications').select('status').eq('id', seed.applications.stripe).single()
    expect(app!.status).toBe('ready_to_apply')

    await panel.getByRole('button', { name: 'Yes, I applied' }).click()
    await expect(panel.getByText('Marked as applied.')).toBeVisible()
    ;({ data: app } = await admin.from('applications').select('status, applied_at').eq('id', seed.applications.stripe).single())
    expect(app!.status).toBe('applied')
    await page.keyboard.press('Escape')

    // It has moved to Applications: the next-ranked opportunity leads the dashboard.
    await page.reload()
    await expect(page.getByTestId('my-pick')).toContainText('Ramp')
    // Display only: the stored ranking is unchanged.
    const { data: ranks } = await admin.from('opportunities').select('rank, is_my_pick').in('id', [seed.opportunities.stripe, seed.opportunities.ramp]).order('rank')
    expect(ranks).toEqual([{ rank: 1, is_my_pick: true }, { rank: 2, is_my_pick: false }])
    await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText('You applied to Stripe')
  })

  test('read-only account: documents stay available, no dismissing or marking applied', async ({ page }) => {
    await signIn(page, readOnlyEmail)
    await expect(page.getByText(/Your account is read-only\./)).toBeVisible()
    await page.waitForTimeout(1500)
    await shot(page, 'desktop-read-only', false)
    await expect(page.getByRole('button', { name: 'Not for me' })).toHaveCount(0)
    await page.getByTestId('my-pick').click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: 'More actions' }).click()
    await expect(panel.getByRole('menuitem', { name: 'Download cover letter PDF' })).toBeVisible()
    await page.keyboard.press('Escape')
    const res = await page.request.post(`/api/applications/${readOnlySeed.applications.stripe}/applied`)
    expect(res.status()).toBe(409)
  })

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, mobileEmail)
    await expect(page.getByTestId('shortlist-row')).toHaveCount(5)
    await expect(page.getByTestId('my-pick')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.waitForTimeout(1500)
    // Applications and Activity reveal on scroll (locked motion).
    await page.mouse.wheel(0, 3000)
    await page.waitForTimeout(800)
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, 'mobile-dashboard')
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('my-pick').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // The panel covers the navigation (z-order), as in the design.
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'mobile-panel', false)
  })

  test('signed-out requests are rejected', async ({ request }) => {
    expect((await request.get(`/api/opportunities/${seed.opportunities.ramp}`)).status()).toBe(401)
    expect((await request.post(`/api/opportunities/${seed.opportunities.criteo}/dismiss`, { data: {} })).status()).toBe(401)
    expect((await request.post(`/api/applications/${seed.applications.ramp}/applied`)).status()).toBe(401)
    expect((await request.get(`/api/opportunities/${seed.opportunities.ramp}/documents/resume`)).status()).toBe(401)
  })
})
