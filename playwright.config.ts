import { defineConfig } from '@playwright/test'

// End-to-end tests run the real app against a local Supabase (`npx supabase start`),
// stripe-mock (`docker run -p 12111:12111 stripe/stripe-mock`) and a mock Claude API.
// Keys below are the public defaults of the local Supabase stack, not secrets.

export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const appEnv = {
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_BASIC: 'price_basic',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_MAX: 'price_max',
  STRIPE_API_BASE: 'http://localhost:12111',
  ANTHROPIC_API_KEY: 'test-key',
  ANTHROPIC_BASE_URL: 'http://localhost:4010',
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node e2e/mock-anthropic.mjs', port: 4010, reuseExistingServer: true },
    {
      // NEXT_PUBLIC_* values are inlined at build time, so build with the local env.
      // Bind explicitly so constrained CI/container runtimes do not need to
      // enumerate host network interfaces just to print a LAN address.
      command: 'npx next build && npx next start -H 127.0.0.1 -p 3000',
      port: 3000,
      timeout: 300_000,
      reuseExistingServer: true,
      env: appEnv,
    },
  ],
})
