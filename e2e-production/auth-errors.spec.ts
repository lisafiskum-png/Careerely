import { expect, test } from '@playwright/test'

// All Auth calls in these tests are intercepted: no accounts, emails, password
// changes, or payments are created in production.
test('an Auth outage allows login retry and does not blame the password', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ msg: 'Service unavailable' }),
  }))
  await page.goto('/login')
  await page.getByLabel('Email').fill('auth-smoke@example.com')
  await page.getByLabel('Password', { exact: true }).fill('mock-password-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('We couldn’t connect')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})

test('password reset rate limits allow another attempt without exposing account existence', async ({ page }) => {
  await page.route('**/auth/v1/recover**', route => route.fulfill({
    status: 429, contentType: 'application/json', body: JSON.stringify({ msg: 'Rate limited' }),
  }))
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('auth-smoke@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeEnabled()
})
