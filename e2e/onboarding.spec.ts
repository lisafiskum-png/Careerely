import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'

// Complete onboarding journey against the real app:
// signup → email confirmation → resume upload/parse/review → preferences →
// "Find my matches" → checkout → first search → dashboard, plus password reset.

const MAILPIT = 'http://127.0.0.1:54324'
const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const email = `lisa+${Date.now()}@example.com`
const password = 'correct-horse-1'
const newPassword = 'battery-staple-2'
let userId = ''

async function latestEmailLink(to: string, subject: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const match = messages.find(m => subject.test(m.Subject))
    if (match) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as { HTML: string }
      const href = message.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1]
      if (href) return href.replace(/&amp;/g, '&')
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`No email matching ${subject} for ${to}`)
}

function resumePdf(): string {
  const doc = new jsPDF()
  const lines = [
    'Lisa Fiskum',
    'AML compliance professional · Oslo, Norway',
    'Experience',
    'AML Analyst, Nordic Bank (2021 - present): due diligence on complex crypto cases,',
    'worked with the sales team on onboarding enterprise clients.',
    'Business Development Associate, Fintech Startup (2018 - 2021): built a pipeline of 40 partner banks.',
    'Education: MSc Finance, BI Norwegian Business School.',
    'Skills: AML, KYC, business development. Languages: Norwegian, English.',
  ]
  lines.forEach((line, i) => doc.text(line, 10, 15 + i * 8))
  const file = path.join(tmpdir(), `resume-${Date.now()}.pdf`)
  writeFileSync(file, Buffer.from(doc.output('arraybuffer')))
  return file
}

async function signIn(page: Page, pass: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pass)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe.serial('onboarding', () => {
  test('Step 1: sign up, then confirm the email', async ({ page }) => {
    await page.goto('/signup?plan=pro')
    await expect(page.getByText('Step 1 of 3')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

    await page.getByLabel('Full name').fill('Lisa Fiskum')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)

    // Continue stays disabled until the terms are accepted (locked design).
    const continueButton = page.getByRole('button', { name: 'Continue' })
    await expect(continueButton).toBeDisabled()
    await page.getByRole('button', { name: 'Terms of Service' }).click()
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()
    await page.getByRole('button', { name: 'Got it' }).click()
    await page.getByLabel(/I agree to the/).check()
    await continueButton.click()

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    const { data: users } = await admin.auth.admin.listUsers()
    userId = users.users.find(u => u.email === email)!.id
    const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single()
    expect(profile).toMatchObject({ first_name: 'Lisa', last_name: 'Fiskum', selected_plan: 'pro' })
    expect(profile.terms_accepted_at).not.toBeNull()

    // Signed-out users cannot reach onboarding.
    await page.goto('/onboarding/3')
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding%2F3/)

    // The confirmation link signs the user in and continues onboarding.
    await page.goto(await latestEmailLink(email, /Confirm your Careerely account/))
    await expect(page).toHaveURL(/\/onboarding\/2$/)
  })

  test('Step 2: upload, parse and review the resume', async ({ page, request }) => {
    await signIn(page, password)
    await expect(page).toHaveURL(/\/onboarding\/2$/)
    await expect(page.getByText('Step 2 of 3')).toBeVisible()

    // Wrong file type is rejected in the browser.
    await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') })
    await expect(page.getByText('We only accept PDF, DOC, or DOCX files.')).toBeVisible()

    await page.locator('input[type=file]').setInputFiles(resumePdf())
    await expect(page.getByText('Resume received')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'Review your profile' })).toBeVisible()
    await expect(page.getByLabel('Full name')).toHaveValue('Lisa Fiskum')
    await page.getByLabel('Headline').fill('AML professional moving into fintech sales')

    // Text extracted from the PDF was sent to Claude (not the raw file).
    const sent = await (await request.get('http://localhost:4010/__last')).json()
    expect(JSON.stringify(sent.messages)).toContain('Nordic Bank')

    // Draft is stored but not yet confirmed: reloading reopens the review state.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Review your profile' })).toBeVisible()
    await page.getByLabel('Headline').fill('AML professional moving into fintech sales')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/onboarding\/3$/)

    const { data: career } = await admin.from('career_profiles').select('*').eq('user_id', userId).single()
    expect(career.resume_confirmed_at).not.toBeNull()
    expect(career.resume_data.headline).toBe('AML professional moving into fintech sales')
    expect(career.resume_text).toContain('Nordic Bank')
    expect(career.suggestions.roles).toEqual(['Business Development Manager', 'Account Executive'])
    const { data: files } = await admin.storage.from('resumes').list(userId)
    expect(files?.length).toBe(1)

    // A user cannot parse another user's file.
    const res = await page.request.post('/api/resume/parse', { data: { path: `00000000-0000-0000-0000-000000000000/x.pdf` } })
    expect(res.status()).toBe(400)
  })

  test('Step 3: preferences, checkout on "Find my matches", first search', async ({ page }) => {
    await signIn(page, password)
    // Unpaid returning users restart at the resume step (their confirmed resume
    // is kept); Step 3 is reachable from there.
    await expect(page).toHaveURL(/\/onboarding\/2$/)
    await page.goto('/onboarding/3')
    await expect(page).toHaveURL(/\/onboarding\/3$/)

    await expect(page.getByRole('heading', { name: 'Your next move' })).toBeVisible()
    await expect(page.getByText("We've built your professional profile. Now let's personalise your search.")).toBeVisible()
    await expect(page.getByText('Suggested from your resume. Edit if needed.')).toBeVisible()
    // Analysing sequence comes from the resume parse, not hardcoded copy.
    await expect(page.getByText('Crypto due diligence exposure')).toBeVisible()
    // AI-suggested chips appear.
    const chip = (value: string) => page.getByRole('button', { name: `Remove ${value}` })
    await expect(chip('Business Development Manager')).toBeVisible()
    await expect(chip('Blockchain & Crypto')).toBeVisible()

    // Custom role (not in the list) and a location via search.
    const roles = page.getByLabel('Desired roles')
    await roles.fill('Partnerships Lead at a crypto exchange')
    await roles.press('Enter')
    await expect(chip('Partnerships Lead at a crypto exchange')).toBeVisible()
    await expect(page.getByText('Choose up to 3')).toHaveCount(0) // 3 of 3 chosen

    await page.getByRole('button', { name: 'Remote' }).click()
    const locations = page.getByLabel('Preferred locations')
    await locations.fill('osl')
    await page.getByRole('option', { name: 'Oslo, Norway' }).click()
    await expect(chip('Oslo, Norway')).toBeVisible()

    await expect(
      page.getByText('We\'ll combine your experience with your preferences to find better matches and tailor every application.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Find my matches' }).click()

    // No subscription yet: plan choice, with the plan picked on the landing page pre-selected.
    await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Pro/ })).toHaveAttribute('aria-checked', 'true')

    const { data: career } = await admin.from('career_profiles').select('*').eq('user_id', userId).single()
    expect(career.target_roles).toEqual([
      'Business Development Manager',
      'Account Executive',
      'Partnerships Lead at a crypto exchange',
    ])
    expect(career.work_styles).toEqual(['on_site', 'remote'])
    expect(career.locations).toEqual(['Oslo, Norway'])
    // The first search must not start before the subscription is active.
    const { count: before } = await admin.from('searches').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    expect(before).toBe(0)

    // Stripe Checkout (hosted page) is simulated: payment succeeds, Stripe's
    // webhook records the subscription, and Stripe redirects back.
    await page.route('https://checkout.stripe.com/**', async route => {
      const { error } = await admin.from('subscriptions').upsert(
        {
          user_id: userId,
          stripe_subscription_id: `sub_e2e_${Date.now()}`,
          plan: 'pro',
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) throw error
      await route.fulfill({
        status: 302,
        headers: { location: 'http://localhost:3000/onboarding/3?checkout=success&session_id=cs_test_e2e' },
      })
    })
    await page.getByRole('button', { name: 'Continue to payment' }).click()

    // Submit sequence: 4 checkmarks, then the success screen with a summary.
    await expect(page.getByText('Tailoring your first applications')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Open to any location')).toHaveCount(0)
    await expect(page.getByText('Oslo, Norway')).toBeVisible()

    const { data: searches } = await admin.from('searches').select('*').eq('user_id', userId)
    expect(searches).toHaveLength(1)
    expect(searches![0]).toMatchObject({ status: 'active', created_from_profile: true, locations: ['Oslo, Norway'] })
    // Phase C: the first Opportunity Engine scan is queued immediately.
    const { data: tasks } = await admin.from('engine_tasks').select('kind, dedupe_key').eq('search_id', searches![0].id)
    expect(tasks).toContainEqual({ kind: 'scan_search', dedupe_key: `scan:${searches![0].id}:first` })
    const { data: profile } = await admin.from('profiles').select('onboarding_completed_at').eq('id', userId).single()
    expect(profile!.onboarding_completed_at).not.toBeNull()

    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    // Phase D: the dashboard shows the first scan running, with no invented numbers.
    await expect(page.getByRole('heading', { name: /Here's what Careerely\s*found for you\./ })).toBeVisible()
    // With no postings synced yet the scan waits; if earlier runs left postings
    // in the local database it may already have finished.
    const status = (await page.getByTestId('scan-status').textContent()) ?? ''
    if (status === 'Scanning the market now') {
      await expect(page.getByTestId('pick-empty')).toHaveText('Your first scan is running. Opportunities will appear here when it finishes.')
      await expect(page.getByTestId('stat-line')).toContainText(/0\s*shortlisted/)
      await expect(page.getByTestId('stat-line')).not.toContainText('reviewed')
    } else {
      expect(status).toMatch(/^Monitoring 24\/7 · (last scan |first scan starting soon)/)
      await expect(page.getByTestId('stat-line')).toContainText(/reviewed in latest scan/)
    }
    await page.waitForTimeout(1200)
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, status === 'Scanning the market now' ? 'desktop-first-scan.png' : 'desktop-empty-after-scan.png') })

    // Finished users skip onboarding and guest pages.
    await page.goto('/onboarding/2')
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('password reset', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    await page.goto(await latestEmailLink(email, /Reset your Careerely password/))
    await expect(page).toHaveURL(/\/reset-password$/)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page).toHaveURL(/\/login\?notice=password_updated/)
    await expect(page.getByText('Your password has been updated.')).toBeVisible()

    await signIn(page, password)
    await expect(page.getByText('That email and password don’t match an account.')).toBeVisible()
    await signIn(page, newPassword)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('API routes reject signed-out requests', async ({ request }) => {
    expect((await request.post('/api/resume/parse', { data: { path: 'a/b.pdf' } })).status()).toBe(401)
    expect((await request.post('/api/resume/confirm', { data: {} })).status()).toBe(401)
    expect((await request.post('/api/onboarding/complete', { data: {} })).status()).toBe(401)
    expect((await request.post('/api/stripe-checkout', { data: { plan: 'pro' } })).status()).toBe(401)
    expect((await request.get('/api/engine/tick')).status()).toBe(401)
  })
})
