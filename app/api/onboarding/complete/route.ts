import { after } from 'next/server'
import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { getStripe } from '../../../../lib/stripe'
import { syncCheckoutSession } from '../../../../lib/billing-sync'
import { getAccessState, type SubscriptionState } from '../../../../lib/plans'
import { enqueueFirstScan, runWorker } from '../../../../lib/engine/queue'
import {
  cleanChips,
  firstSearchName,
  isWorkStyle,
  MAX_INDUSTRIES,
  MAX_LOCATIONS,
  MAX_ROLES,
} from '../../../../lib/onboarding'

const Body = z.object({
  preferences: z
    .object({
      roles: z.array(z.string()),
      industries: z.array(z.string()),
      workStyles: z.array(z.string()),
      locations: z.array(z.string()),
    })
    .optional(),
  sessionId: z.string().max(300).optional(),
})

// "Find my matches" (end of onboarding Step 3).
//
// 1. Saves the preferences to the career profile.
// 2. If returning from Stripe Checkout, confirms the session and syncs the
//    subscription right away (the webhook does the same, later).
// 3. Without an active subscription: responds checkout_required, and nothing
//    else happens. The first search must not start before payment.
// 4. With one: creates the first search from the career profile (or updates it
//    if the user edited their preferences) and completes onboarding.
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const { preferences, sessionId } = parsed.data

    const supabase = await createClient()
    const admin = createAdminClient()

    if (preferences) {
      const roles = cleanChips(preferences.roles, MAX_ROLES)
      const workStyles = [...new Set(preferences.workStyles.filter(isWorkStyle))]
      if (roles.length === 0) return Response.json({ error: 'Choose at least one role.' }, { status: 400 })
      if (workStyles.length === 0) return Response.json({ error: 'Choose how you’d like to work.' }, { status: 400 })

      const { data, error } = await supabase
        .from('career_profiles')
        .update({
          target_roles: roles,
          industries: cleanChips(preferences.industries, MAX_INDUSTRIES),
          work_styles: workStyles,
          locations: cleanChips(preferences.locations, MAX_LOCATIONS),
        })
        .eq('user_id', user.id)
        .select('resume_confirmed_at')
      if (error) throw error
      if (!data?.length || !data[0].resume_confirmed_at) {
        return Response.json({ error: 'Please upload and review your resume first.' }, { status: 409 })
      }
    }

    if (sessionId) {
      try {
        await syncCheckoutSession(admin, getStripe(), sessionId, user.id)
      } catch (err) {
        // The webhook will still deliver the subscription; report as pending.
        console.error('checkout session sync failed', err)
      }
    }

    const { data: subscription } = await admin
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle<SubscriptionState>()
    const access = getAccessState(subscription)

    if (access.kind !== 'active') {
      const { data: profile } = await supabase.from('profiles').select('selected_plan').eq('id', user.id).maybeSingle()
      return Response.json({
        status: sessionId ? 'payment_pending' : 'checkout_required',
        selectedPlan: profile?.selected_plan ?? null,
      })
    }

    const { data: career, error: careerError } = await admin
      .from('career_profiles')
      .select('target_roles, industries, work_styles, locations, min_compensation, resume_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (careerError) throw careerError
    if (!career?.resume_confirmed_at || career.target_roles.length === 0) {
      return Response.json({ error: 'Please finish your preferences first.' }, { status: 409 })
    }

    const searchFields = {
      name: firstSearchName(career.target_roles),
      target_roles: career.target_roles,
      industries: career.industries,
      work_styles: career.work_styles,
      locations: career.locations,
      min_compensation: career.min_compensation,
    }

    const { data: existing } = await admin
      .from('searches')
      .select('id')
      .eq('user_id', user.id)
      .eq('created_from_profile', true)
      .limit(1)
    let searchId: string
    if (existing?.length) {
      const { error } = await admin.from('searches').update(searchFields).eq('id', existing[0].id)
      if (error) throw error
      searchId = existing[0].id
    } else {
      const { data: created, error } = await admin
        .from('searches')
        .insert({ ...searchFields, user_id: user.id, status: 'active', created_from_profile: true })
        .select('id')
        .single()
      if (error) throw error
      searchId = created.id
    }

    // Start the first scan now instead of waiting for tonight's run.
    await enqueueFirstScan(admin, user.id, searchId)
    after(async () => {
      try {
        await runWorker(createAdminClient(), { budgetMs: 240_000 })
      } catch (err) {
        console.error('first scan kickoff failed', err)
      }
    })

    const { error: completeError } = await admin
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id)
      .is('onboarding_completed_at', null)
    if (completeError) throw completeError

    return Response.json({ status: 'started' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('onboarding complete failed', err)
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
