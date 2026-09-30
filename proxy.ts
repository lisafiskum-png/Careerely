import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Runs before every page request: refreshes the Supabase session cookies and
// keeps signed-out visitors out of the app. API routes do their own auth check
// (lib/auth.ts), so they are excluded here.

const PROTECTED_PREFIXES = ['/dashboard', '/onboarding']
// Signed-in users skip these and continue where they left off.
const GUEST_ONLY = ['/signup', '/login']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // getUser() validates the session with Supabase Auth and refreshes it if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && isProtected) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/login'
    signIn.search = `?next=${encodeURIComponent(pathname)}`
    return redirectWithCookies(signIn, response)
  }

  if (user && GUEST_ONLY.includes(pathname)) {
    const onboarding = request.nextUrl.clone()
    onboarding.pathname = '/onboarding'
    onboarding.search = ''
    return redirectWithCookies(onboarding, response)
  }

  return response
}

// Keep any refreshed session cookies when redirecting.
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
