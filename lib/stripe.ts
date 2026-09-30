import 'server-only'
import Stripe from 'stripe'
import { env } from './env'
import type { PlanId } from './plans'

let client: Stripe | null = null

// Created lazily so a missing key fails the request, not the build.
export function getStripe(): Stripe {
  client ??= new Stripe(env.stripeSecretKey())
  return client
}

const PRICE_ENV: Record<PlanId, string> = {
  basic: 'STRIPE_PRICE_BASIC',
  pro: 'STRIPE_PRICE_PRO',
  max: 'STRIPE_PRICE_MAX',
}

export function priceIdForPlan(plan: PlanId): string {
  const priceId = process.env[PRICE_ENV[plan]]
  if (!priceId) throw new Error(`Missing required environment variable: ${PRICE_ENV[plan]}`)
  return priceId
}

export function priceIdToPlanMap(): Record<string, PlanId> {
  const map: Record<string, PlanId> = {}
  for (const [plan, name] of Object.entries(PRICE_ENV) as [PlanId, string][]) {
    const priceId = process.env[name]
    if (priceId) map[priceId] = plan
  }
  return map
}
