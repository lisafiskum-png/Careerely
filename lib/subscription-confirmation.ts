import 'server-only'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'
import { PLANS, type PlanId } from './plans'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function subscriptionConfirmationMessage(input: {
  firstName: string | null
  plan: PlanId
  currentPeriodEnd: string | null
}) {
  const plan = PLANS.find(candidate => candidate.id === input.plan)!
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,'
  const renewal = input.currentPeriodEnd
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(input.currentPeriodEnd))
    : null
  const renewalText = renewal ? `Your next billing date is ${renewal}.` : 'Your subscription is now active.'

  return {
    subject: `Welcome to Careerely — your ${plan.name} plan is active`,
    text: `${greeting}\n\nYour Careerely account has been created and your ${plan.name} subscription is active at $${plan.monthlyPriceUsd}/month. ${renewalText}\n\nCareerely will now search for relevant opportunities and prepare tailored applications based on your profile and preferences.\n\nYou can manage or cancel your subscription at any time from Settings.\n\nWelcome to Careerely.`,
    html: `
      <div style="background:#f7f7f5;padding:40px 16px;font-family:Arial,sans-serif;color:#171717">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7e2;border-radius:18px;padding:36px">
          <div style="font-size:24px;font-weight:700;margin-bottom:32px">Careerely</div>
          <h1 style="font-size:28px;line-height:1.2;margin:0 0 18px">Your account is ready</h1>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px">${escapeHtml(greeting)}</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 22px">Your Careerely account has been created and your <strong>${plan.name}</strong> subscription is active.</p>
          <div style="background:#f3f0ff;border-radius:12px;padding:18px 20px;margin-bottom:24px">
            <div style="font-size:13px;color:#6b6675;text-transform:uppercase;letter-spacing:.08em">Subscription</div>
            <div style="font-size:20px;font-weight:700;margin-top:6px">${plan.name} · $${plan.monthlyPriceUsd}/month</div>
            <div style="font-size:14px;color:#6b6675;margin-top:6px">${escapeHtml(renewalText)}</div>
          </div>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Careerely will now search for relevant opportunities and prepare tailored applications based on your profile and preferences.</p>
          <p style="font-size:14px;line-height:1.6;color:#6b6675;margin:0">You can manage or cancel your subscription at any time from Settings.</p>
        </div>
      </div>`,
  }
}

export async function sendSubscriptionConfirmation(
  admin: SupabaseClient,
  userId: string,
  plan: PlanId,
  currentPeriodEnd: string | null,
): Promise<void> {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('first_name, subscription_confirmation_sent_at')
    .eq('id', userId)
    .single()
  if (profileError) throw profileError
  if (profile.subscription_confirmation_sent_at) return

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError) throw userError
  if (!userData.user.email) throw new Error(`Careerely user ${userId} has no email address`)

  const message = subscriptionConfirmationMessage({ firstName: profile.first_name, plan, currentPeriodEnd })
  const { error: sendError } = await new Resend(env.resendApiKey()).emails.send({
    from: 'Careerely <hello@careerely.ai>',
    to: userData.user.email,
    ...message,
  })
  if (sendError) throw new Error(`Subscription confirmation email failed: ${sendError.message}`)

  const { error: markError } = await admin
    .from('profiles')
    .update({ subscription_confirmation_sent_at: new Date().toISOString() })
    .eq('id', userId)
    .is('subscription_confirmation_sent_at', null)
  if (markError) throw markError
}
