import { expect, test } from '@playwright/test'

test('public customer entry points work without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Career growth,\s*powered by AI/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.goto('/login')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.goto('/signup')
  await expect(page.getByLabel('Full name')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('legal pages and production health are available', async ({ page, request }) => {
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()

  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ status: 'ok', database: 'ok', queue: 'ok' })
})
