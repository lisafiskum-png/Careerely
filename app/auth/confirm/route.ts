import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '../../../lib/supabase/server'
import { safeNextPath } from '../../../lib/onboarding'

// Landing point for links in auth emails (confirm signup, reset password).
// Supports both link styles:
//   ?token_hash=…&type=…  — our email templates (work on any device)
//   ?code=…               — Supabase's default PKCE links (same browser only)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  const supabase = await createClient()
  let ok = false
  let isRecovery = type === 'recovery'

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
    isRecovery = searchParams.get('next') === '/reset-password'
  }

  if (!ok) return NextResponse.redirect(new URL('/login?notice=link_invalid', origin))

  const destination = isRecovery ? '/reset-password' : safeNextPath(searchParams.get('next'), '/onboarding')
  return NextResponse.redirect(new URL(destination, origin))
}
