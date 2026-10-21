import { expect, test } from '@playwright/test'

test('public customer entry points work without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Career growth,\s*powered by AI/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', 'mailto:hello@careerely.ai')
  await expect(page.getByText('All rights reserved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Careerely on LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/company/careerely/')
  await expect(page.getByRole('link', { name: 'Careerely on Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/careerely.ai')
  await expect(page.getByRole('link', { name: 'Careerely on X' })).toHaveAttribute('href', 'https://x.com/careerely_ai')
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

test('public discovery metadata does not expose private app routes', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  const robotsText = await robots.text()
  expect(robotsText).toContain('Disallow: /dashboard')
  expect(robotsText).toContain('Sitemap: https://www.careerely.ai/sitemap.xml')

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()
  expect(xml).toContain('<loc>https://www.careerely.ai</loc>')
  expect(xml).not.toContain('/dashboard')

  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  await expect(manifest.json()).resolves.toMatchObject({ name: 'Careerely', start_url: '/' })

  const security = await request.get('/.well-known/security.txt')
  expect(security.ok()).toBe(true)
  const securityText = await security.text()
  expect(securityText).toContain('Contact: mailto:hello@careerely.ai')
  expect(securityText).toContain('Canonical: https://www.careerely.ai/.well-known/security.txt')
})

test('public responses keep the launch security baseline', async ({ request }) => {
  for (const path of ['/', '/login', '/signup', '/terms', '/privacy']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    expect(response.headers()['x-frame-options'], path).toBe('DENY')
    expect(response.headers()['x-content-type-options'], path).toBe('nosniff')
    expect(response.headers()['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(response.headers()['permissions-policy'], path).toContain('camera=()')
    expect(response.headers()['content-security-policy'], path).toContain("frame-ancestors 'none'")
  }
})
