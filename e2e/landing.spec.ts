import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('is globally positioned, has explicit login, and leads into signup', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Career growth,\s*powered by AI/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    await expect(page.getByRole('heading', { name: 'This is what Careerely does around the clock.' })).toBeAttached()
    await expect(page.getByRole('heading', { name: 'Three steps' })).toBeAttached()
    await expect(page.getByRole('heading', { name: 'Not another job board.' })).toBeAttached()

    const body = await page.locator('body').innerText()
    for (const obsolete of ['leading tech companies', 'Nightly', 'Every night', 'Roles reviewed while you sleep', 'This is what Careerely does while you sleep.']) {
      expect(body).not.toContain(obsolete)
    }
    await expect(page.getByText('Always looking for what’s new')).toBeAttached()
    await expect(page.getByText('Recent activity')).toBeAttached()
    await expect(page.getByText('Review application')).toBeAttached()

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

    // The landing email is only a sign-up prefill; it never authenticates a user.
    await page.goto('/')
    await page.getByLabel('Email address').first().fill('new-person@example.com')
    await page.getByRole('button', { name: 'Get Started' }).first().click()
    await expect(page).toHaveURL(/\/signup\?email=new-person%40example\.com/)
    await expect(page.getByLabel('Email')).toHaveValue('new-person@example.com')
  })

  test('has no horizontal scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
