import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// D8: the per-user daily cap on immediate scans from Search actions, as the
// user sees it. Over the cap, saving or resuming still works and the search
// is active, but nothing claims it is scanning now.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stamp = Date.now()
const basicEmail = `cap-basic+${stamp}@example.com`
const proEmail = `cap-pro+${stamp}@example.com`
type Seed = Awaited<ReturnType<typeof seedDashboardUser>>
let basic: Seed
let pro: Seed

const today = () => new Date().toISOString().slice(0, 10)
const scanTasks = async (searchId: string) => (await admin.from('engine_tasks').select('dedupe_key').eq('kind', 'scan_search').eq('search_id', searchId)).data ?? []

async function signIn(page: Page, address: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}
const card = (page: Page, name: string) => page.getByTestId('search-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
async function menu(page: Page, name: string, item: string) {
  await card(page, name).getByRole('button', { name: `Options for ${name}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe.serial('immediate scan cap', () => {
  test.beforeAll(async () => {
    basic = await seedDashboardUser(admin, { email: basicEmail, firstName: 'Lisa' })
    await admin.from('subscriptions').update({ plan: 'basic' }).eq('user_id', basic.userId)
    const { error } = await admin.from('searches').insert({ user_id: basic.userId, name: 'Second search', status: 'paused', created_from_profile: false, target_roles: ['Sales Manager'], work_styles: ['remote'] })
    if (error) throw error
    pro = await seedDashboardUser(admin, { email: proEmail, firstName: 'Lisa' })
  })
  test.afterAll(async () => {
    for (const s of [basic, pro]) if (s) await admin.auth.admin.deleteUser(s.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('Basic: the first resume scans now; the next one joins continuous monitoring and says so', async ({ page }) => {
    await signIn(page, basicEmail)
    await page.goto('/searches')
    const bd = (await admin.from('searches').select('id').eq('user_id', basic.userId).eq('name', 'Business Development Manager').single()).data!.id
    const second = (await admin.from('searches').select('id').eq('user_id', basic.userId).eq('name', 'Second search').single()).data!.id

    await menu(page, 'Business Development Manager', 'Pause search')
    await expect(card(page, 'Business Development Manager').getByTestId('search-status')).toHaveText('Paused')
    await menu(page, 'Business Development Manager', 'Resume search')
    await expect(card(page, 'Business Development Manager').getByTestId('search-status')).toHaveText('Active')
    await expect(page.getByTestId('scan-deferred')).toHaveCount(0)
    expect((await scanTasks(bd)).map(t => t.dedupe_key)).toEqual([expect.stringMatching(new RegExp(`^scan:${bd}:resume:\\d+$`))])

    // Allowance spent: a different search resumes, stays active, and waits for tonight.
    await menu(page, 'Business Development Manager', 'Pause search')
    await expect(card(page, 'Business Development Manager').getByTestId('search-status')).toHaveText('Paused')
    await menu(page, 'Second search', 'Resume search')
    await expect(page.getByTestId('scan-deferred')).toHaveText('Search resumed. Careerely is monitoring it continuously and will pick it up within a few minutes.')
    await expect(card(page, 'Second search').getByTestId('search-status')).toHaveText('Active')
    await expect(card(page, 'Second search').getByTestId('scan-line')).toHaveText(/Monitoring 24\/7\s*Next market refresh within a few minutes/)
    expect(await scanTasks(second)).toEqual([])
    expect((await admin.from('searches').select('status').eq('id', second).single()).data!.status).toBe('active')
  })

  test('Pro over the cap: a new active search is saved, active, and joins continuous monitoring', async ({ page }) => {
    await admin.from('immediate_scan_usage').upsert({ user_id: pro.userId, day: today(), used: 5 })
    await signIn(page, proEmail)
    await page.goto('/searches')
    await page.getByRole('button', { name: 'New search' }).click()
    const form = page.getByTestId('search-form')
    await form.getByLabel('Search name').fill('Later today')
    await form.getByRole('button', { name: 'Start search' }).click()
    await expect(form).toHaveCount(0)
    await expect(page.getByTestId('scan-deferred')).toHaveText('Search saved. Careerely is monitoring it continuously and will pick it up within a few minutes.')
    await expect(card(page, 'Later today').getByTestId('search-status')).toHaveText('Active')
    await expect(card(page, 'Later today').getByTestId('scan-line')).toHaveText(/Monitoring 24\/7\s*Next market refresh within a few minutes/)
    const { data: created } = await admin.from('searches').select('id, status').eq('user_id', pro.userId).eq('name', 'Later today').single()
    expect(created!.status).toBe('active')
    expect(await scanTasks(created!.id)).toEqual([])
  })

  test('onboarding’s first scan is not limited by the cap', async ({ page }) => {
    // Allowance already spent today (previous test).
    await signIn(page, proEmail)
    const res = await page.request.post('/api/onboarding/complete', { data: {} })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'started' })
    const profileSearch = (await admin.from('searches').select('id').eq('user_id', pro.userId).eq('created_from_profile', true).single()).data!.id
    expect((await scanTasks(profileSearch)).map(t => t.dedupe_key)).toContain(`scan:${profileSearch}:first`)
  })
})
