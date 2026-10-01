import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Applications page (Phase D4) against the real app and seeded local data.
// Set SCREENSHOT_DIR to save desktop and mobile screenshots.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const shots = process.env.SCREENSHOT_DIR
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })
}

const stamp = Date.now()
const email = `apps+${stamp}@example.com`
const readOnlyEmail = `apps-ro+${stamp}@example.com`
const mobileEmail = `apps-m+${stamp}@example.com`
type Seed = Awaited<ReturnType<typeof seedDashboardUser>>
let seed: Seed
let readOnlySeed: Seed
let mobileSeed: Seed
let extra: Record<string, { opportunityId: string; applicationId: string }> = {}

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/**
 * Adds prepared applications in every state: one at Interview (with its stored
 * history), one Applied, one Declined, and one Ready whose posting is no
 * longer listed.
 */
async function addApplications(userId: string) {
  const { data: search } = await admin.from('searches').select('id').eq('user_id', userId).single()
  const specs = [
    { company: 'Revolut', title: 'Partnerships Manager, Crypto', location: 'London, UK', active: true, status: 'interview', outcome: null, appliedAt: days(5) },
    { company: 'N26', title: 'Business Development Manager', location: 'Berlin, Germany', active: true, status: 'applied', outcome: null, appliedAt: days(3) },
    { company: 'Wise', title: 'Account Executive', location: 'London, UK', active: true, status: 'applied', outcome: 'declined', appliedAt: days(9) },
    { company: 'Plaid', title: 'Partnerships Lead', location: 'Remote', active: false, status: 'ready_to_apply', outcome: null, appliedAt: null },
  ] as const
  const out: typeof extra = {}
  for (const [i, s] of specs.entries()) {
    const tag = `${userId}-${i}`
    const { data: job, error } = await admin
      .from('jobs')
      .insert({ source: 'greenhouse', source_job_id: `e2e-app-${tag}`, url: `https://example.com/apps/${tag}`, title: s.title, company: s.company, location: s.location, work_style: 'hybrid', is_active: s.active, description: `${s.company} is hiring.`, dedupe_key: `e2e-app-${tag}` })
      .select('id')
      .single()
    if (error) throw error
    const { data: opp } = await admin
      .from('opportunities')
      .insert({ user_id: userId, job_id: job!.id, search_id: search!.id, state: 'ready', rank: 20 + i, match_score: 70 - i, goal_aligned: true })
      .select('id')
      .single()
    const { data: pkg } = await admin
      .from('application_packages')
      .insert({ user_id: userId, opportunity_id: opp!.id, status: 'ready', has_changes: true, tailored_resume_text: 'Lisa Fiskum\nAML Analyst, Nordic Bank', cover_letter_segments: [{ segmentType: 'opening', text: `Hello ${s.company}.`, evidenceRecordIds: [] }], completed_at: days(10 - i) })
      .select('id')
      .single()
    const { data: app, error: appError } = await admin
      .from('applications')
      .insert({ user_id: userId, opportunity_id: opp!.id, package_id: pkg!.id, job_id: job!.id, status: s.status, outcome: s.outcome, applied_at: s.appliedAt, status_updated_at: days(i === 0 ? 2 : 1) })
      .select('id')
      .single()
    if (appError) throw appError
    const events: { kind: string; payload: object; created_at: string }[] = [{ kind: 'application_prepared', payload: {}, created_at: days(10 - i) }]
    if (s.appliedAt) events.push({ kind: 'application_applied', payload: {}, created_at: s.appliedAt })
    if (s.status === 'interview') events.push({ kind: 'application_status_changed', payload: { status: 'interview', outcome: null }, created_at: days(2) })
    if (s.outcome) events.push({ kind: 'application_status_changed', payload: { status: s.status, outcome: s.outcome }, created_at: days(1) })
    await admin.from('activity').insert(events.map(e => ({ ...e, user_id: userId, opportunity_id: opp!.id, application_id: app!.id })))
    out[s.company] = { opportunityId: opp!.id, applicationId: app!.id }
  }
  return out
}

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

const appRow = (page: Page, company: string) => page.getByTestId('app-row').filter({ hasText: company })
const readyCard = (page: Page, company: string) => page.getByTestId('ready-card').filter({ hasText: company })
const appState = async (id: string) => (await admin.from('applications').select('status, outcome, applied_at').eq('id', id).single()).data!

test.describe.serial('applications', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
    extra = await addApplications(seed.userId)
    readOnlySeed = await seedDashboardUser(admin, { email: readOnlyEmail, firstName: 'Lisa', readOnly: true })
    await addApplications(readOnlySeed.userId)
    mobileSeed = await seedDashboardUser(admin, { email: mobileEmail, firstName: 'Lisa' })
    await addApplications(mobileSeed.userId)
  })
  test.afterAll(async () => {
    for (const s of [seed, readOnlySeed, mobileSeed]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('Ready to apply first, then Your applications; counts from stored data', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    await page.getByRole('region', { name: 'Applications ready' }).getByRole('link', { name: 'View all →' }).click()
    await expect(page).toHaveURL(/\/applications$/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: /^Applications/ })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByText('Applications2')).toBeVisible() // Ready to apply, posting still listed

    // Master Brief §11 line: prepared = all 6, applied = 3 with an applied date, interviews = 1 current.
    await expect(page.getByTestId('app-summary')).toHaveText(/6\s*applications prepared\s*·\s*3\s*applied\s*·\s*1\s*interview/)

    await expect(page.getByTestId('ready-card')).toHaveCount(3)
    await expect(page.getByTestId('ready-count')).toHaveText('3 applications')
    await expect(readyCard(page, 'Stripe')).toContainText('86% match')
    await expect(readyCard(page, 'Stripe')).toContainText('Cover letter drafted')
    await expect(readyCard(page, 'Stripe').getByRole('button', { name: 'Review application' })).toBeVisible()
    await expect(readyCard(page, 'Plaid')).toContainText('Posting no longer listed')
    // Stored rank order; postings no longer listed last.
    await expect(page.getByTestId('ready-card').nth(0)).toContainText('Stripe')
    await expect(page.getByTestId('ready-card').nth(1)).toContainText('Ramp')
    await expect(page.getByTestId('ready-card').nth(2)).toContainText('Plaid')

    const rows = page.getByTestId('app-row')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId('submitted-count')).toHaveText('3 applications')
    // Active stages first (Interview, then Applied), closed outcomes last.
    await expect(rows.nth(0)).toContainText('Revolut')
    await expect(rows.nth(0).getByTestId('status-pill')).toHaveText('Interview')
    await expect(rows.nth(1)).toContainText('N26')
    await expect(rows.nth(1).getByTestId('status-pill')).toHaveText('Applied')
    await expect(rows.nth(2)).toContainText('Wise')
    await expect(rows.nth(2).getByTestId('status-pill')).toHaveText('Declined')
    await expect(rows.nth(2)).toHaveClass(/closed/)
    for (const banned of ['No response', 'Kanban']) await expect(page.getByText(banned)).toHaveCount(0)

    await page.mouse.move(5, 300)
    await page.waitForTimeout(900)
    await shot(page, 'applications-desktop')
  })

  test('opening the posting never marks Applied; only "Yes, I applied" does', async ({ page, context }) => {
    await signIn(page, email)
    await page.goto('/applications')
    await readyCard(page, 'Stripe').getByRole('button', { name: 'Review application' }).click()
    const panel = page.getByRole('dialog')
    const popup = context.waitForEvent('page')
    await panel.getByRole('button', { name: 'Continue to application →' }).click()
    await (await popup).close()
    await expect(panel.getByText('Did you apply?')).toBeVisible()
    expect((await appState(seed.applications.stripe)).status).toBe('ready_to_apply')

    // "Not yet" leaves it Ready.
    await panel.getByRole('button', { name: 'Not yet' }).click()
    expect((await appState(seed.applications.stripe)).status).toBe('ready_to_apply')

    const popup2 = context.waitForEvent('page')
    await panel.getByRole('button', { name: 'Continue to application →' }).click()
    await (await popup2).close()
    await panel.getByRole('button', { name: 'Yes, I applied' }).click()
    await expect(panel.getByText('Marked as applied.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(readyCard(page, 'Stripe')).toHaveCount(0)
    await expect(appRow(page, 'Stripe').getByTestId('status-pill')).toHaveText('Applied')
    await expect(page.getByTestId('app-summary')).toHaveText(/4\s*applied/)
    const s = await appState(seed.applications.stripe)
    expect(s.status).toBe('applied')
    expect(s.applied_at).not.toBeNull()
  })

  test('manual status updates: stages, closing and reopening; recorded as a timeline', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/applications')

    // Applied → Interview.
    await appRow(page, 'N26').getByRole('button', { name: 'Update' }).click()
    await page.getByRole('menuitemradio', { name: 'Interview' }).click()
    await expect(appRow(page, 'N26').getByTestId('status-pill')).toHaveText('Interview')
    expect(await appState(extra.N26.applicationId)).toMatchObject({ status: 'interview', outcome: null })
    await expect(page.getByTestId('app-summary')).toHaveText(/2\s*interviews/)

    // Declined → reopened by choosing a stage.
    await appRow(page, 'Wise').getByRole('button', { name: 'Update' }).click()
    await page.getByRole('menuitemradio', { name: 'Applied' }).click()
    await expect(appRow(page, 'Wise').getByTestId('status-pill')).toHaveText('Applied')
    expect(await appState(extra.Wise.applicationId)).toMatchObject({ status: 'applied', outcome: null })

    // Interview → Withdrawn (closed, kept at its stage).
    await appRow(page, 'Revolut').getByRole('button', { name: 'Update' }).click()
    await page.getByRole('menuitemradio', { name: 'Withdrawn' }).click()
    await expect(appRow(page, 'Revolut').getByTestId('status-pill')).toHaveText('Withdrawn')
    expect(await appState(extra.Revolut.applicationId)).toMatchObject({ status: 'interview', outcome: 'withdrawn' })

    // Stored history in the panel, newest first.
    await appRow(page, 'Revolut').click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByTestId('panel-status')).toHaveText('Withdrawn')
    await expect(panel.getByRole('button', { name: 'Continue to application →' })).toHaveCount(0)
    const timeline = panel.getByTestId('timeline')
    await expect(timeline.locator('.tl-label')).toHaveText(['Withdrawn', 'Interview', 'Applied', 'Application prepared by Careerely'])
    await page.waitForTimeout(500)
    await shot(page, 'applications-panel-timeline', false)
    await page.keyboard.press('Escape')

    // There is no way back to Ready to apply, and Ready applications can't be given a status here.
    expect((await page.request.post(`/api/applications/${seed.applications.ramp}/status`, { data: { status: 'interview' } })).status()).toBe(409)
    const { count } = await admin.from('activity').select('id', { count: 'exact', head: true }).eq('user_id', seed.userId).eq('kind', 'application_status_changed')
    expect(count).toBeGreaterThanOrEqual(3 + 2) // 3 here + 2 seeded

    // Recent activity on the dashboard shows the changes.
    await page.goto('/dashboard')
    const activity = page.getByRole('region', { name: 'Recent activity' })
    await activity.scrollIntoViewIfNeeded()
    await expect(activity).toContainText('Marked Revolut — Partnerships Manager, Crypto as Withdrawn')
  })

  test('a Ready application whose posting is no longer listed keeps its documents', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/applications')
    await readyCard(page, 'Plaid').click()
    const panel = page.getByRole('dialog')
    await expect(panel.locator('.ft-status')).toHaveText('Posting no longer listed')
    await expect(panel.getByRole('button', { name: 'Continue to application →' })).toHaveCount(0)
    await panel.getByRole('button', { name: 'More actions' }).click()
    const href = await panel.getByRole('menuitem', { name: 'Download resume PDF' }).getAttribute('href')
    expect((await page.request.get(href!)).headers()['content-type']).toBe('application/pdf')
  })

  test('read-only account: everything visible, nothing can be updated', async ({ page }) => {
    await signIn(page, readOnlyEmail)
    await page.goto('/applications')
    await expect(page.getByTestId('app-row')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Update' })).toHaveCount(0)
    await readyCard(page, 'Stripe').click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: 'More actions' }).click()
    await expect(panel.getByRole('menuitem', { name: 'Download cover letter PDF' })).toBeVisible()
    await page.keyboard.press('Escape')
    const { data: n26 } = await admin.from('applications').select('id').eq('user_id', readOnlySeed.userId).eq('status', 'applied').is('outcome', null).limit(1).single()
    expect((await page.request.post(`/api/applications/${n26!.id}/status`, { data: { status: 'interview' } })).status()).toBe(409)
  })

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, mobileEmail)
    await page.goto('/applications')
    await expect(page.getByTestId('app-row')).toHaveCount(3)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.waitForTimeout(900)
    await shot(page, 'applications-mobile')
    await appRow(page, 'N26').getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Offer' })).toBeVisible()
    await shot(page, 'applications-mobile-menu', false)
  })

  test('signed-out visitors are sent to sign in; the API rejects them', async ({ page, request }) => {
    await page.goto('/applications')
    await expect(page).toHaveURL(/\/login\?next=%2Fapplications/)
    expect((await request.post(`/api/applications/${seed.applications.ramp}/status`, { data: { status: 'applied' } })).status()).toBe(401)
  })
})
