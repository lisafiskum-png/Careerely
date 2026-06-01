export type BillingPeriod = 'monthly' | 'annual'
export type PlanId = 'standard' | 'pro' | 'premium'

export type BillingOption = {
  label: string
  priceLabel: string
  discountLabel?: string
}

type PricingPlan = {
  id: PlanId
  title: string
  tagline: string
  monthly: number
  annual: number
  description: string
  features: string[]
  badge: string
  highlight?: boolean
}

export const planOrder: PlanId[] = ['standard', 'pro', 'premium']
export const planRank: Record<PlanId, number> = {
  standard: 0,
  pro: 1,
  premium: 2,
}

export function isPlanAtLeast(current: PlanId, required: PlanId) {
  if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') return true
  return planRank[current] >= planRank[required]
}

export const defaultPlan: PlanId = 'standard'

export const pricingPlans: PricingPlan[] = [
  {
    id: 'standard',
    title: 'Standard',
    tagline: 'For casual job seekers testing the market.',
    monthly: 29,
    annual: 23,
    description: 'All the essentials to build strong, tailored applications without the noise.',
    features: [
      '10 cover letters per month',
      'Voice matching from your application',
      'Application dashboard',
      'PDF cover letter downloads',
      'CV review (upload and improve)',
      'Basic ATS score',
    ],
    badge: 'Standard',
  },
  {
    id: 'pro',
    title: 'Pro',
    tagline: 'For active job seekers ready to move fast.',
    monthly: 49,
    annual: 39,
    description: 'Unlimited cover letters, smarter job discovery, and AI-powered application support.',
    features: [
      'Unlimited cover letters',
      'Voice matching from your application',
      'Real-time job board scraping',
      'One-click apply',
      'Quality scoring and ranking',
      'Application dashboard',
      'PDF cover letter downloads',
      'CV builder from scratch + review',
      'Full ATS optimisation + keywords',
      'AI Career Assistant (10 chats/day)',
      'Daily email digest',
    ],
    badge: 'Pro',
    highlight: true,
  },
  {
    id: 'premium',
    title: 'Premium',
    tagline: 'For maximum results. Every advantage unlocked.',
    monthly: 79,
    annual: 63,
    description: 'The full career growth suite with custom analytics, prep, outreach, and unlimited AI support.',
    features: [
      'Everything in Pro',
      'ATS optimisation per job',
      'AI Career Assistant (unlimited)',
      'Interview prep generator',
      'Follow-up email drafts',
      'Recruiter outreach drafts',
      'Dream company monitoring',
      'Priority generation speed',
      'Salary intelligence and benchmarks',
      'Application analytics and insights',
      'Weekly job market report',
    ],
    badge: 'Premium',
  },
]

export const billingOptions: Record<BillingPeriod, BillingOption> = {
  monthly: {
    label: 'Monthly',
    priceLabel: 'per month',
  },
  annual: {
    label: 'Annual',
    priceLabel: 'per month, billed annually',
    discountLabel: 'Save 20%',
  },
}

export const planBadgeStyles = {
  Standard: { background: 'rgba(34,197,94,0.1)', color: '#22c55e' },
  Pro: { background: 'rgba(167,139,250,0.1)', color: '#a78bfa' },
  Premium: { background: 'rgba(236,72,153,0.1)', color: '#ec4899' },
}
