import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'
import { PASSWORD, seedDashboardUser } from './seed-dashboard'

// D8 launch hardening: security headers, the not-found page, and the panel's
// error state.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email = `hardening+${Date.now()}@example.com`
let seed: Awaited<ReturnType<typeof seedDashboardUser>>

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe.serial('launch hardening', () => {
  test.beforeAll(async () => {
    seed = await seedDashboardUser(admin, { email, firstName: 'Lisa' })
  })
  test.afterAll(async () => {
    if (seed) await admin.auth.admin.deleteUser(seed.userId)
    await admin.from('jobs').delete().like('source_job_id', 'e2e-%')
  })

  test('security headers on pages and API routes', async ({ request }) => {
    for (const path of ['/', '/login', '/dashboard', '/api/opportunities/00000000-0000-0000-0000-000000000000']) {
      const res = await request.get(path, { maxRedirects: 0 })
      const h = res.headers()
      expect(h['x-frame-options'], path).toBe('DENY')
      expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'")
      expect(h['x-content-type-options'], path).toBe('nosniff')
      expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    }
  })

  test('unknown pages show "Page not found" (desktop and mobile)', async ({ page }) => {
    const res = await page.goto('/no-such-page')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.getByRole('link', { name: 'Go to your dashboard' }).click()
    await expect(page).toHaveURL(/\/login/) // signed out
  })

  test('the opportunity panel says so when it can’t load', async ({ page }) => {
    await signIn(page)
    await page.route(/\/api\/opportunities\/[0-9a-f-]{36}$/, route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' }))
    await page.getByTestId('my-pick').click()
    await expect(page.getByRole('dialog').getByTestId('panel-error')).toHaveText('Couldn’t load this opportunity. Please try again.')
  })
})
