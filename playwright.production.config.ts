import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-production',
  timeout: 45_000,
  retries: 1,
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL || 'https://www.careerely.ai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ],
})
