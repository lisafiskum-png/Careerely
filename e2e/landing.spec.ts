import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('matches the reference sections and leads into signup', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Career growth,\s*powered by AI/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'This is what Careerely does while you sleep.' })).toBeAttached()
    await expect(page.getByRole('heading', { name: 'Three steps' })).toBeAttached()
    await expect(page.getByRole('heading', { name: 'Not another job board.' })).toBeAttached()

    // Demo plays when scrolled into view: count-up reaches the reference value.
    await page.locator('#demo').scrollIntoViewIfNeeded()
    await expect(page.getByText('2,143', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    // Pricing matches billing.
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    for (const price of ['$29', '$49', '$79']) await expect(page.getByText(price, { exact: true })).toBeVisible()
    await expect(page.getByText('Most Popular')).toBeVisible()

    // Plan button carries the plan into signup.
    await page.getByRole('link', { name: 'Get Started' }).nth(2).click()
    await expect(page).toHaveURL(/\/signup\?plan=pro$/)

    // Email entered on the landing page pre-fills signup.
    await page.goto('/')
    await page.getByLabel('Email address').first().fill('lisa@example.com')
    await page.getByRole('button', { name: 'Get Started' }).first().click()
    await expect(page).toHaveURL(/\/signup\?email=lisa%40example\.com/)
    await expect(page.getByLabel('Email')).toHaveValue('lisa@example.com')
  })

  test('has no horizontal scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
