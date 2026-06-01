import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const PRICE_MAP = {
  standard_monthly: process.env.STRIPE_STANDARD_MONTHLY,
  standard_annual: process.env.STRIPE_STANDARD_ANNUAL,
  pro_monthly: process.env.STRIPE_PRO_MONTHLY,
  pro_annual: process.env.STRIPE_PRO_ANNUAL,
  premium_monthly: process.env.STRIPE_PREMIUM_MONTHLY,
  premium_annual: process.env.STRIPE_PREMIUM_ANNUAL,
}

export async function POST(request) {
  try {
    const { plan, billing, userId, email } = await request.json()
    const key = `${plan}_${billing}`
    const priceId = PRICE_MAP[key]

    if (!priceId) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      metadata: { userId, plan, billing },
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/?cancelled=true`,
      subscription_data: {
        metadata: { userId, plan },
      },
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
