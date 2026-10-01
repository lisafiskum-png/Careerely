import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// Searches page (Phase D5) against the real app and seeded local data.
// Set SCREENSHOT_DIR to save desktop and mobile screenshots.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const shots = process.env.SCREENSHOT_DIR
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })
}

const stamp = Date.now()
const email = `searches+${stamp}@example.com`
const emptyEmail = `searches-e+${stamp}@example.com`
const readOnlyEmail = `searches-ro+${stamp}@example.com`
const mobileEmail = `searches-m+${stamp}@example.com`
type Seed = Awaited<ReturnType<typeof seedDashboardUser>>
let seed: Seed
let emptySeed: Seed
let readOnlySeed: Seed
let mobileSeed: Seed
let saasId: string
let bdId: string

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const DAY = 86_400_000

/** A paused search with one completed scan two days ago. */
async function addPausedSearch(userId: string): Promise<string> {
  const { data: s, error } = await admin
    .from('searches')
    .insert({
      user_id: userId,
      name: 'SaaS Account Executive',
      status: 'paused',
      target_roles: ['Account Executive', 'Enterprise Account Executive'],
      industries: ['B2B SaaS'],
      locations: ['London, UK'],
      work_styles: ['remote'],
      min_compensation: 70000,
      compensation_currency: 'GBP',
      created_at: ago(5 * DAY),
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: runError } = await admin
    .from('search_runs')
    .insert({ user_id: userId, search_id: s.id, status: 'succeeded', jobs_reviewed: 301, jobs_shortlisted: 2, started_at: ago(2 * DAY + 3_700_000), finished_at: ago(2 * DAY + 3_600_000) })
  if (runError) throw runError
  return s.id
}

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

const card = (page: Page, name: string) => page.getByTestId('search-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const searchRow = async (id: string) =>
  (await admin.from('searches').select('name, status, target_roles, industries, locations, work_styles, min_compensation, compensation_currency, created_from_profile').eq('id', id).single()).data!
const scanTasks = async (searchId: string) => (await admin.from('engine_tasks').select('dedupe_key, payload').eq('kind', 'scan_search').eq('search_id', searchId)).data ?? []
const profileRow = async (userId: string) =>
  (await admin.from('career_profiles').select('target_roles, industries, locations, work_styles, min_compensation, compensation_currency').eq('user_id', userId).single()).data!

async function openMenu(page: Page, name: string) {
  await card(page, name).getByRole('button', { name: `Options for ${name}` }).click()
}

test.describe.serial('searches', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
    bdId = (await admin.from('searches').select('id').eq('user_id', seed.userId).single()).data!.id
    saasId = await addPausedSearch(seed.userId)
    emptySeed = await seedDashboardUser(admin, { email: emptyEmail, firstName: 'Lisa' })
    await admin.from('searches').delete().eq('user_id', emptySeed.userId)
    readOnlySeed = await seedDashboardUser(admin, { email: readOnlyEmail, firstName: 'Lisa', readOnly: true })
    mobileSeed = await seedDashboardUser(admin, { email: mobileEmail, firstName: 'Lisa' })
    await addPausedSearch(mobileSeed.userId)
  })
  test.afterAll(async () => {
    for (const s of [seed, emptySeed, readOnlySeed, mobileSeed]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('cards show stored parameters and the latest completed scan; plan usage counts active searches', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Searches' }).click()
    await expect(page).toHaveURL(/\/searches$/)
    await expect(nav.getByRole('link', { name: 'Searches' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Searches', level: 1 })).toBeVisible()
    await expect(page.getByText('What Careerely is hunting for on your behalf.')).toBeVisible()

    // Limit from the plan configuration (Pro = 5); only active searches count.
    await expect(page.getByTestId('plan-bar')).toHaveText(/1 of 5\s*active searches · Pro plan/)
    await expect(page.getByTestId('plan-bar').locator('.pip')).toHaveCount(5)
    await expect(page.getByTestId('plan-bar').locator('.pip.on')).toHaveCount(1)

    // Active first, then paused.
    const cards = page.getByTestId('search-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0).getByRole('heading')).toHaveText('Business Development Manager')
    await expect(cards.nth(1).getByRole('heading')).toHaveText('SaaS Account Executive')

    const bd = card(page, 'Business Development Manager')
    await expect(bd.getByTestId('search-status')).toHaveText('Active')
    await expect(bd).toContainText('Created from your preferences')
    await expect(bd.getByTestId('reviewed')).toHaveText('4,393')
    await expect(bd).toContainText('Reviewed in latest scan')
    await expect(bd.getByTestId('shortlisted')).toHaveText('8')
    await expect(bd).toContainText('Shortlisted in latest scan')
    await expect(bd.getByTestId('scan-line')).toHaveText(/Last scan \d+ min ago\s*Scans nightly/)

    const saas = card(page, 'SaaS Account Executive')
    await expect(saas.getByTestId('search-status')).toHaveText('Paused')
    await expect(saas).not.toContainText('Created from your preferences')
    await expect(saas.getByTestId('reviewed')).toHaveText('301')
    await expect(saas.getByTestId('shortlisted')).toHaveText('2')
    await expect(saas.getByTestId('scan-line')).toHaveText(/Paused\s*Last scan 2 days ago/)
    await expect(saas.getByTestId('search-params')).toContainText('Min £70,000 a year')
    await expect(saas.getByTestId('search-params')).toContainText('Remote')

    // Nothing invented, no deletion in V1.
    await expect(page.getByText(/scanning continuously/i)).toHaveCount(0)
    // D6: "Manage plan →" leads to Settings; "Upgrade →" stays hidden.
    await expect(page.getByRole('link', { name: 'Manage plan →' })).toHaveAttribute('href', '/settings')
    await expect(page.getByText(/Upgrade/)).toHaveCount(0)
    await expect(page.getByTestId('all-paused-banner')).toHaveCount(0)
    await openMenu(page, 'SaaS Account Executive')
    await expect(page.getByRole('menuitem')).toHaveText(['Edit search', 'Resume search'])
    await page.keyboard.press('Escape')
    await page.mouse.move(5, 300)
    await page.waitForTimeout(900)
    await shot(page, 'searches-desktop')
  })

  test('creating a search: profile values first, free-text chips, limits, currency; first scan queued', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, email)
    await page.goto('/searches')
    const before = await profileRow(seed.userId)
    await page.getByRole('button', { name: 'New search' }).click()
    const form = page.getByTestId('search-form')
    await expect(form.getByRole('heading', { name: 'New search' })).toBeVisible()
    await expect(form).toContainText('Pre-filled from your Career Profile. Changes here apply to this search only.')
    // Career Profile values are the starting selection.
    const roles = form.getByRole('group', { name: 'Target roles' })
    await expect(roles.getByRole('button', { name: 'Business Development Manager' })).toHaveAttribute('aria-pressed', 'true')
    await expect(roles.getByRole('button', { name: 'Account Executive' })).toHaveAttribute('aria-pressed', 'true')
    await expect(form.getByRole('group', { name: 'Locations' }).getByRole('button', { name: 'Dublin, Ireland' })).toHaveAttribute('aria-pressed', 'true')
    await expect(form.getByRole('group', { name: 'Work style' }).getByRole('button', { name: 'Hybrid' })).toHaveAttribute('aria-pressed', 'true')
    await expect(form.getByRole('group', { name: 'Work style' }).getByRole('button', { name: 'On-site' })).toHaveAttribute('aria-pressed', 'false')
    // No Career Profile compensation preference exists: say so honestly.
    await expect(form.getByTestId('comp-help')).toHaveText('Leave blank for no minimum.')

    // Name is required.
    await form.getByRole('button', { name: 'Start search' }).click()
    await expect(form.getByRole('alert')).toHaveText('Give this search a name.')
    await form.getByLabel('Search name').fill('Payments partnerships')

    // Free-text chips, within the Step 3 limits (1–3 roles).
    await roles.getByLabel('Add a role').fill('Payments Partnerships Lead')
    await roles.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(roles.getByRole('button', { name: 'Payments Partnerships Lead' })).toHaveAttribute('aria-pressed', 'true')
    await roles.getByLabel('Add a role').fill('Head of Growth')
    await roles.getByLabel('Add a role').press('Enter')
    await expect(roles).toContainText('You can choose up to 3.')
    await expect(roles.getByRole('button', { name: 'Head of Growth' })).toHaveCount(0)
    await roles.getByRole('button', { name: 'Account Executive' }).click()
    const industries = form.getByRole('group', { name: 'Industries' })
    await industries.getByLabel('Add an industry').fill('Embedded Finance')
    await industries.getByRole('button', { name: 'Add', exact: true }).click()

    // A minimum needs a currency; it is annual.
    await form.getByLabel('Minimum compensation (optional)').fill('85,000')
    await expect(form).toContainText('per year')
    await form.getByRole('button', { name: 'Start search' }).click()
    await expect(form.getByRole('alert')).toHaveText('Choose a currency for the minimum compensation.')
    await form.getByLabel('Currency').selectOption('GBP')
    await shot(page, 'searches-create-form', false)
    await form.getByRole('button', { name: 'Start search' }).click()
    await expect(form).toHaveCount(0)

    const created = card(page, 'Payments partnerships')
    await expect(created.getByTestId('search-status')).toHaveText('Active')
    await expect(created.getByTestId('scan-line')).toHaveText(/First scan queued|Scanning now…/)
    await expect(created.getByTestId('reviewed')).toHaveText('—')
    await expect(created.getByTestId('search-params')).toContainText('Min £85,000 a year')
    await expect(created).not.toContainText('Created from your preferences')
    await expect(page.getByTestId('plan-bar')).toHaveText(/2 of 5\s*active searches/)

    const { data: row } = await admin.from('searches').select('id').eq('user_id', seed.userId).eq('name', 'Payments partnerships').single()
    expect(await searchRow(row!.id)).toMatchObject({
      status: 'active',
      target_roles: ['Business Development Manager', 'Payments Partnerships Lead'],
      industries: ['Fintech', 'Embedded Finance'],
      locations: ['Dublin, Ireland', 'London, UK'],
      work_styles: ['hybrid', 'remote'],
      min_compensation: 85000,
      compensation_currency: 'GBP',
      created_from_profile: false,
    })
    // First scan queued immediately.
    expect((await scanTasks(row!.id)).map(t => t.dedupe_key)).toEqual([`scan:${row!.id}:first`])
    // The Career Profile is never changed by a search.
    expect(await profileRow(seed.userId)).toEqual(before)
  })

  test('editing applies to this search only and does not rescan', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/searches')
    const before = await profileRow(seed.userId)

    await openMenu(page, 'SaaS Account Executive')
    await page.getByRole('menuitem', { name: 'Edit search' }).click()
    const form = page.getByTestId('search-form')
    await expect(form.getByRole('heading', { name: 'Edit search' })).toBeVisible()
    await expect(form.getByTestId('edit-scope')).toHaveText('Changes apply to this search only and will not affect your Career Profile.')
    await expect(form.getByTestId('edit-next-scan')).toHaveText('New settings apply from the next scan.')
    await expect(form.getByLabel('Currency').locator('option[value="BRL"]')).toHaveText('BRL — Brazilian Real')
    await expect(form.getByLabel('Search name')).toHaveValue('SaaS Account Executive')
    await expect(form.getByLabel('Minimum compensation (optional)')).toHaveValue('70,000')
    await expect(form.getByLabel('Currency')).toHaveValue('GBP')
    // Profile values appear as suggestions alongside the search's own values.
    await expect(form.getByRole('group', { name: 'Target roles' }).getByRole('button', { name: 'Business Development Manager' })).toHaveAttribute('aria-pressed', 'false')
    await shot(page, 'searches-edit-form', false)
    await form.getByLabel('Search name').fill('SaaS AE')
    await form.getByLabel('Minimum compensation (optional)').fill('')
    await form.getByRole('group', { name: 'Work style' }).getByRole('button', { name: 'Hybrid' }).click()
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form).toHaveCount(0)
    await expect(card(page, 'SaaS AE').getByTestId('search-status')).toHaveText('Paused')
    expect(await searchRow(saasId)).toMatchObject({ name: 'SaaS AE', status: 'paused', work_styles: ['remote', 'hybrid'], min_compensation: null, compensation_currency: null })

    // Editing an active search: saved, but no immediate rescan.
    const tasksBefore = (await scanTasks(bdId)).length
    await openMenu(page, 'Business Development Manager')
    await page.getByRole('menuitem', { name: 'Edit search' }).click()
    await form.getByRole('group', { name: 'Industries' }).getByLabel('Add an industry').fill('Payments')
    await form.getByRole('group', { name: 'Industries' }).getByRole('button', { name: 'Add', exact: true }).click()
    // This seeded search has no work style; at least one is required.
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form.getByRole('alert')).toHaveText('Choose at least one work style.')
    await form.getByRole('group', { name: 'Work style' }).getByRole('button', { name: 'Remote' }).click()
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form).toHaveCount(0)
    expect(await searchRow(bdId)).toMatchObject({ industries: ['Payments'], work_styles: ['remote'] })
    expect((await scanTasks(bdId)).length).toBe(tasksBefore)
    await expect(card(page, 'Business Development Manager').getByTestId('scan-line')).toHaveText(/Last scan \d+ min ago\s*Scans nightly/)
    expect(await profileRow(seed.userId)).toEqual(before)
  })

  test('pause and resume; a resumed search is scanned at most once a day', async ({ page }) => {
    await signIn(page, email)
    await page.goto('/searches')
    await openMenu(page, 'Business Development Manager')
    await page.getByRole('menuitem', { name: 'Pause search' }).click()
    const bd = card(page, 'Business Development Manager')
    await expect(bd.getByTestId('search-status')).toHaveText('Paused')
    await expect(bd.getByTestId('scan-line')).toHaveText(/Paused\s*Last scan \d+ min ago/)
    expect((await searchRow(bdId)).status).toBe('paused')
    await expect(page.getByTestId('plan-bar')).toHaveText(/1 of 5/)

    await openMenu(page, 'Business Development Manager')
    await page.getByRole('menuitem', { name: 'Resume search' }).click()
    await expect(bd.getByTestId('search-status')).toHaveText('Active')
    const day = new Date().toISOString().slice(0, 10)
    expect((await scanTasks(bdId)).filter(t => t.dedupe_key === `scan:${bdId}:${day}`)).toHaveLength(1)

    // Pausing and resuming again does not queue another scan.
    for (const action of ['Pause search', 'Resume search']) {
      await openMenu(page, 'Business Development Manager')
      await page.getByRole('menuitem', { name: action }).click()
      await expect(bd.getByTestId('search-status')).toHaveText(action === 'Pause search' ? 'Paused' : 'Active')
    }
    expect((await scanTasks(bdId)).filter(t => (t.payload as { trigger?: string }).trigger === 'resume')).toHaveLength(1)
  })

  test('at the active-search limit: "Save as paused" with an explanation, Resume blocked, never silent', async ({ page }) => {
    // 2 active now (Business Development Manager, Payments partnerships); fill the Pro limit of 5.
    for (const name of ['Fill 1', 'Fill 2', 'Fill 3']) {
      const { error } = await admin.from('searches').insert({ user_id: seed.userId, name, status: 'active', target_roles: ['Sales Manager'], work_styles: ['remote'] })
      if (error) throw error
    }
    await signIn(page, email)
    await page.goto('/searches')
    await expect(page.getByTestId('plan-bar')).toHaveText(/5 of 5\s*active searches · Pro plan/)

    // Resume is blocked with an explanation; nothing changes.
    await openMenu(page, 'SaaS AE')
    await page.getByRole('menuitem', { name: 'Resume search' }).click()
    await expect(page.getByTestId('limit-banner')).toHaveText('You’ve reached your active search limit. Pause another search to resume this one.')
    expect((await searchRow(saasId)).status).toBe('paused')
    expect((await page.request.post(`/api/searches/${saasId}/status`, { data: { status: 'active' } })).status()).toBe(409)
    expect((await searchRow(saasId)).status).toBe('paused')

    // An active create at the limit is refused, not silently paused.
    const count = async () => (await admin.from('searches').select('id', { count: 'exact', head: true }).eq('user_id', seed.userId)).count
    const n = await count()
    const refused = await page.request.post('/api/searches', { data: { name: 'Sneaky', targetRoles: ['Sales Manager'], workStyles: ['remote'], status: 'active' } })
    expect(refused.status()).toBe(409)
    expect(await count()).toBe(n)

    // The form says so up front and saves as paused only when the user chooses it.
    await page.getByRole('button', { name: 'New search' }).click()
    const form = page.getByTestId('search-form')
    await expect(form.getByTestId('limit-message')).toHaveText('You’ve reached 5 active searches. This search will be saved as paused.')
    await expect(form.getByRole('button', { name: 'Start search' })).toHaveCount(0)
    await form.getByLabel('Search name').fill('Later')
    await shot(page, 'searches-limit-form', false)
    await form.getByRole('button', { name: 'Save as paused' }).click()
    await expect(form).toHaveCount(0)
    await expect(card(page, 'Later').getByTestId('search-status')).toHaveText('Paused')
    await expect(card(page, 'Later').getByTestId('scan-line')).toHaveText(/Paused\s*Not scanned yet/)
    const { data: later } = await admin.from('searches').select('id, status').eq('user_id', seed.userId).eq('name', 'Later').single()
    expect(later!.status).toBe('paused')
    expect(await scanTasks(later!.id)).toHaveLength(0)

    // Pausing another search makes room; the explanation goes away.
    await openMenu(page, 'Fill 3')
    await page.getByRole('menuitem', { name: 'Pause search' }).click()
    await expect(page.getByTestId('plan-bar')).toHaveText(/4 of 5/)
    await openMenu(page, 'Later')
    await page.getByRole('menuitem', { name: 'Resume search' }).click()
    await expect(card(page, 'Later').getByTestId('search-status')).toHaveText('Active')
    await expect(page.getByTestId('limit-banner')).toHaveCount(0)
  })

  test('all searches paused: cards stay, with the "isn’t currently searching" banner; the nav never says scanning', async ({ page }) => {
    await admin.from('searches').update({ status: 'paused' }).eq('user_id', seed.userId)
    // Stale and retrying work left behind for paused searches must not read as scanning.
    const { error } = await admin.from('engine_tasks').insert([
      { kind: 'scan_search', dedupe_key: `e2e-stale-first:${saasId}`, user_id: seed.userId, search_id: saasId, status: 'queued', attempts: 1, payload: { phase: 'start', trigger: 'first' }, run_after: new Date(Date.now() + DAY).toISOString(), last_error: 'retrying' },
      { kind: 'scan_search', dedupe_key: `e2e-stale-running:${bdId}`, user_id: seed.userId, search_id: bdId, status: 'running', attempts: 1, payload: { phase: 'start', trigger: 'resume' }, run_after: ago(60_000), locked_until: new Date(Date.now() + DAY).toISOString() },
    ])
    if (error) throw error
    const { error: runError } = await admin.from('search_runs').insert({ user_id: seed.userId, search_id: saasId, status: 'running', started_at: ago(60_000) })
    if (runError) throw runError

    await signIn(page, email)
    await page.goto('/searches')
    await expect(page.getByTestId('all-paused-banner')).toHaveText('Careerely isn’t currently searching. Resume a search below to start scanning the market again.')
    await expect(page.getByTestId('search-card').first()).toBeVisible()
    await expect(page.getByTestId('plan-bar')).toHaveText(/0 of 5/)
    await expect(page.getByTestId('scan-status')).toHaveText(/^Last scan /)
    await expect(page.getByText('Scanning the market', { exact: true })).toHaveCount(0)
    await page.waitForTimeout(700)
    await shot(page, 'searches-all-paused')

    // Control: the same running task counts once its search is active again.
    await admin.from('searches').update({ status: 'active' }).eq('id', bdId)
    await page.reload()
    await expect(page.getByTestId('scan-status')).toHaveText('Scanning the market')
    await admin.from('searches').update({ status: 'paused' }).eq('id', bdId)
    await admin.from('engine_tasks').delete().like('dedupe_key', 'e2e-stale-%')
    await admin.from('search_runs').delete().eq('search_id', saasId).eq('status', 'running')
  })

  test('no searches yet', async ({ page }) => {
    await signIn(page, emptyEmail)
    await page.goto('/searches')
    const empty = page.getByTestId('searches-empty')
    await expect(empty.getByRole('heading', { name: 'No searches yet' })).toBeVisible()
    await expect(page.getByTestId('all-paused-banner')).toHaveCount(0)
    await expect(page.getByTestId('plan-bar')).toHaveText(/0 of 5/)
    await page.waitForTimeout(700)
    await shot(page, 'searches-empty')
    await empty.getByRole('button', { name: 'Create search' }).click()
    await expect(page.getByTestId('search-form')).toBeVisible()
  })

  test('read-only account: searches visible, nothing can be created or changed', async ({ page }) => {
    await signIn(page, readOnlyEmail)
    await page.goto('/searches')
    await expect(page.getByTestId('read-only-notice')).toBeVisible()
    await expect(page.getByTestId('search-card')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'New search' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Options for/ })).toHaveCount(0)
    await expect(page.getByTestId('plan-bar')).toHaveCount(0)
    const id = (await admin.from('searches').select('id').eq('user_id', readOnlySeed.userId).single()).data!.id
    expect((await page.request.post('/api/searches', { data: { name: 'X', targetRoles: ['Sales Manager'], workStyles: ['remote'], status: 'paused' } })).status()).toBe(403)
    expect((await page.request.post(`/api/searches/${id}/status`, { data: { status: 'active' } })).status()).toBe(403)
    expect((await page.request.patch(`/api/searches/${id}`, { data: { name: 'X', targetRoles: ['Sales Manager'], workStyles: ['remote'] } })).status()).toBe(403)
    expect((await searchRow(id)).status).toBe('paused')
  })

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, mobileEmail)
    await page.goto('/searches')
    await expect(page.getByTestId('search-card')).toHaveCount(2)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.waitForTimeout(900)
    await shot(page, 'searches-mobile')
    await openMenu(page, 'SaaS Account Executive')
    await page.getByRole('menuitem', { name: 'Edit search' }).click()
    await expect(page.getByTestId('search-form')).toBeVisible()
    await page.waitForTimeout(400)
    await shot(page, 'searches-mobile-form', false)
  })

  test('signed-out visitors are sent to sign in; the API rejects them', async ({ page, request }) => {
    await page.goto('/searches')
    await expect(page).toHaveURL(/\/login\?next=%2Fsearches/)
    expect((await request.post('/api/searches', { data: {} })).status()).toBe(401)
    expect((await request.post(`/api/searches/${bdId}/status`, { data: { status: 'paused' } })).status()).toBe(401)
  })
})
