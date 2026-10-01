import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Opportunities page (Phase D3) against the real app and seeded local data.
// Set SCREENSHOT_DIR to save desktop and mobile screenshots.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const shots = process.env.SCREENSHOT_DIR
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })
}

const stamp = Date.now()
const email = `opps+${stamp}@example.com`
const emptyEmail = `opps-empty+${stamp}@example.com`
const mobileEmail = `opps-m+${stamp}@example.com`
let seed: Awaited<ReturnType<typeof seedDashboardUser>>
let emptySeed: Awaited<ReturnType<typeof seedDashboardUser>>
let mobileSeed: Awaited<ReturnType<typeof seedDashboardUser>>

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** Adds an opportunity whose posting is no longer listed, and one the user has applied to. */
async function addHiddenOpportunities(userId: string) {
  const { data: search } = await admin.from('searches').select('id').eq('user_id', userId).single()
  const { data: jobs, error } = await admin
    .from('jobs')
    .insert([
      { source: 'greenhouse', source_job_id: `e2e-closed-${userId}`, url: 'https://example.com/closed', title: 'Partnerships Manager, Closed', company: 'Plaid', is_active: false, dedupe_key: `e2e-closed-${userId}` },
      { source: 'greenhouse', source_job_id: `e2e-applied-${userId}`, url: 'https://example.com/applied', title: 'Account Executive, Applied', company: 'Wise', is_active: true, dedupe_key: `e2e-applied-${userId}` },
    ])
    .select('id, company')
  if (error) throw error
  const jobId = (c: string) => jobs!.find(j => j.company === c)!.id
  const { data: opps } = await admin
    .from('opportunities')
    .insert([
      { user_id: userId, job_id: jobId('Plaid'), search_id: search!.id, state: 'shortlisted', rank: 9, match_score: 65, goal_aligned: true },
      { user_id: userId, job_id: jobId('Wise'), search_id: search!.id, state: 'ready', rank: 10, match_score: 64, goal_aligned: true },
    ])
    .select('id, job_id')
  const wise = opps!.find(o => o.job_id === jobId('Wise'))!
  await admin.from('applications').insert({ user_id: userId, opportunity_id: wise.id, job_id: jobId('Wise'), status: 'applied', applied_at: new Date().toISOString() })
}

test.describe.serial('opportunities', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
    await addHiddenOpportunities(seed.userId)
    emptySeed = await seedDashboardUser(admin, { email: emptyEmail, firstName: 'Lisa' })
    mobileSeed = await seedDashboardUser(admin, { email: mobileEmail, firstName: 'Lisa' })
  })
  test.afterAll(async () => {
    for (const s of [seed, emptySeed, mobileSeed]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('lists every active opportunity in stored rank order, states kept distinct', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)

    // Reached from the dashboard ("View all opportunities") and the nav.
    await page.getByRole('link', { name: 'View all opportunities →' }).click()
    await expect(page).toHaveURL(/\/opportunities$/)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Opportunities/ })).toHaveAttribute('aria-current', 'page')

    await expect(page.getByTestId('op-title')).toHaveText('8 opportunities')
    await expect(page.getByText(/Ranked by Careerely\.\s*4,393 reviewed in latest scan\./)).toBeVisible()
    await expect(page.getByText(/Last scan 3 min ago/).first()).toBeVisible()

    const pick = page.getByTestId('op-pick')
    await expect(pick).toContainText('My pick')
    await expect(pick).toContainText('Business Development Lead, Payments')
    await expect(pick).toContainText('86% match')
    await expect(pick.locator('.chip-ev')).toHaveCount(2)
    await expect(pick).toContainText('I’d start here because')
    await expect(pick).toContainText('Resume tailored')
    await expect(pick.getByRole('button', { name: 'Review application' })).toBeVisible()
    await expect(pick.getByRole('button', { name: 'Not for me' })).toHaveCount(0) // only via the panel

    // Full list (no dashboard preview limit); closed posting and applied one are not shown.
    const rows = page.getByTestId('op-row')
    await expect(rows).toHaveCount(7)
    await expect(page.getByTestId('op-count')).toHaveText('7 opportunities')
    await expect(rows.nth(0)).toContainText('Ramp')
    await expect(rows.nth(6)).toContainText('Databricks')
    await expect(page.getByText('Plaid')).toHaveCount(0)
    await expect(page.getByText('Wise')).toHaveCount(0)

    // States: Ready badge, Preparing still reviewable, only Shortlisted can be dismissed.
    await expect(rows.nth(0)).toContainText('Application ready')
    await expect(rows.nth(1)).toContainText('Preparing application…')
    await expect(rows.nth(1).getByRole('button', { name: 'Review' })).toBeVisible()
    await expect(rows.nth(0).getByRole('button', { name: 'Not for me' })).toHaveCount(0)
    await expect(rows.nth(1).getByRole('button', { name: 'Not for me' })).toHaveCount(0)
    await expect(rows.nth(2).getByRole('button', { name: 'Not for me' })).toHaveCount(1)
    for (const banned of ['~5 min', 'I’d look at this', "I'd look at this", 'Worth reviewing', 'Actively hiring']) {
      await expect(page.getByText(banned)).toHaveCount(0)
    }
    // Every row has a match % and its own evidence chips.
    for (let i = 0; i < 7; i++) {
      await expect(rows.nth(i).locator('.chip-match')).toHaveCount(1)
      await expect(rows.nth(i).locator('.chip-ev')).toHaveCount(2)
    }

    // The closed posting is hidden on the dashboard too.
    await page.goto('/dashboard')
    await expect(page.getByText('Plaid')).toHaveCount(0)

    await page.goto('/opportunities')
    await page.mouse.move(5, 300)
    await page.waitForTimeout(1200)
    await shot(page, 'opportunities-desktop')
  })

  test('panel: per-opportunity requirements; Preparing opens; PDF only when Ready', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    await page.goto('/opportunities')
    await page.getByTestId('op-row').filter({ hasText: 'Cohere' }).getByRole('button', { name: 'Review' }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toContainText('Account Executive, EMEA')
    await expect(panel).toContainText('Preparing application…')
    await panel.getByRole('tab', { name: 'The role' }).click()
    await expect(panel).toContainText('Sell Cohere’s platform')
    const reqs = panel.locator('.req-item')
    await expect(reqs.filter({ hasText: 'Experience with AML or financial compliance' })).toContainText('Confirmed')
    await expect(reqs.filter({ hasText: 'Fluency in English' })).toContainText('Couldn’t confirm')
    await expect(panel.getByRole('button', { name: 'More actions' })).toHaveCount(0) // nothing to download yet; can't dismiss Preparing
    await page.keyboard.press('Escape')

    await page.getByTestId('op-pick').click()
    await panel.getByRole('tab', { name: 'The role' }).click()
    await page.waitForTimeout(500)
    await shot(page, 'opportunities-panel-role', false)
    await panel.getByRole('button', { name: 'More actions' }).click()
    const href = await panel.getByRole('menuitem', { name: 'Download cover letter PDF' }).getAttribute('href')
    const pdf = await page.request.get(href!)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
  })

  test('"Not for me" asks first; cancel changes nothing; confirm with or without a reason', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/opportunities')
    const row = (company: string) => page.getByTestId('op-row').filter({ hasText: company })
    const state = async (id: string) => (await admin.from('opportunities').select('dismissed_at, dismiss_reason').eq('id', id).single()).data!
    const prompt = page.getByTestId('dismiss-prompt')

    // Cancel: nothing changes, the row stays, the count stays.
    await row('Criteo').hover()
    await row('Criteo').getByRole('button', { name: 'Not for me' }).click()
    await expect(prompt).toBeVisible()
    for (const label of ['Role', 'Company', 'Location', 'Salary', 'Industry', 'Other', 'Dismiss without a reason', 'Cancel']) {
      await expect(prompt.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await prompt.getByRole('button', { name: 'Cancel' }).click()
    await expect(prompt).toHaveCount(0)
    await expect(row('Criteo')).toBeVisible()
    await expect(page.getByTestId('op-title')).toHaveText('8 opportunities')
    expect(await state(seed.opportunities.criteo)).toEqual({ dismissed_at: null, dismiss_reason: null })
    await page.reload()
    await expect(row('Criteo')).toBeVisible()

    // Confirm with a reason.
    await row('Criteo').hover()
    await row('Criteo').getByRole('button', { name: 'Not for me' }).click()
    await prompt.getByRole('button', { name: 'Salary' }).click()
    await expect(row('Criteo')).toHaveCount(0)
    await expect(page.getByTestId('op-title')).toHaveText('7 opportunities')
    await expect(page.getByTestId('op-count')).toHaveText('6 opportunities')
    await expect.poll(async () => (await state(seed.opportunities.criteo)).dismiss_reason).toBe('salary')

    // Confirm without a reason.
    await row('Nubank').hover()
    await row('Nubank').getByRole('button', { name: 'Not for me' }).click()
    await prompt.getByRole('button', { name: 'Dismiss without a reason' }).click()
    await expect(row('Nubank')).toHaveCount(0)
    await expect.poll(async () => (await state(seed.opportunities.nubank)).dismissed_at).not.toBeNull()
    expect((await state(seed.opportunities.nubank)).dismiss_reason).toBeNull()
  })

  test('"You’re all caught up" only once every opportunity, My Pick included, is gone', async ({ page }) => {
    // All shortlisted, everything but My Pick already dismissed.
    const ids = Object.values(emptySeed.opportunities)
    await admin.from('applications').delete().eq('user_id', emptySeed.userId)
    await admin.from('application_packages').delete().eq('user_id', emptySeed.userId)
    await admin.from('opportunities').update({ state: 'shortlisted' }).in('id', ids)
    await admin.from('opportunities').update({ dismissed_at: new Date().toISOString() }).in('id', ids.filter(id => id !== emptySeed.opportunities.stripe))

    await signIn(page, emptyEmail)
    await page.goto('/opportunities')
    await expect(page.getByTestId('op-title')).toHaveText('1 opportunity')
    await expect(page.getByText('You’re all caught up')).toHaveCount(0)

    // My Pick is dismissed through the panel's overflow menu only.
    await page.getByTestId('op-pick').click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: 'More actions' }).click()
    await panel.getByRole('menuitem', { name: 'Not for me' }).click()
    // The panel closes and the prompt appears with My Pick still in place; cancelling keeps it.
    const prompt = page.getByTestId('dismiss-prompt')
    await expect(prompt).toBeVisible()
    await expect(page.getByTestId('op-pick')).toBeVisible()
    await prompt.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('op-pick')).toBeVisible()
    expect((await admin.from('opportunities').select('dismissed_at').eq('id', emptySeed.opportunities.stripe).single()).data!.dismissed_at).toBeNull()

    await page.getByTestId('op-pick').click()
    await panel.getByRole('button', { name: 'More actions' }).click()
    await panel.getByRole('menuitem', { name: 'Not for me' }).click()
    await prompt.getByRole('button', { name: 'Dismiss without a reason' }).click()
    await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible()
    await expect(page.getByTestId('op-title')).toHaveText('0 opportunities')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible()
    await page.waitForTimeout(800)
    await shot(page, 'opportunities-caught-up', false)
    // D5: the Searches page exists, so the empty state links to it.
    await page.getByRole('link', { name: 'Adjust your searches →' }).click()
    await expect(page).toHaveURL(/\/searches$/)
  })

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, mobileEmail)
    await page.goto('/opportunities')
    await expect(page.getByTestId('op-row')).toHaveCount(7)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.waitForTimeout(1500)
    await shot(page, 'opportunities-mobile')
    await page.getByTestId('op-row').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'opportunities-mobile-panel', false)
  })

  test('signed-out visitors are sent to sign in', async ({ page }) => {
    await page.goto('/opportunities')
    await expect(page).toHaveURL(/\/login\?next=%2Fopportunities/)
  })
})
