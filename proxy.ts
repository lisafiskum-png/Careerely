import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Runs before every page request: refreshes the Supabase session cookies and
// keeps signed-out visitors out of the app. API routes do their own auth check
// (lib/auth.ts), so they are excluded here.

const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/opportunities', '/applications', '/searches', '/settings']
// A signed-in user may still need to switch accounts, so /login must always
// render the credential form. Signup remains reserved for new registrations.
const GUEST_ONLY = ['/signup']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))

  // Public pages must not depend on an auth-provider round trip. Besides being
  // unnecessary, doing this for the landing and login pages makes their TTFB
  // depend on Supabase availability and can look like an endless page load on
  // slower mobile connections. Signup is the only public-looking route that
  // needs the user check, because an existing session is redirected away.
  if (!isProtected && !GUEST_ONLY.includes(pathname)) return response

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

  if (!user && isProtected) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/login'
    signIn.search = `?next=${encodeURIComponent(pathname)}`
    return redirectWithCookies(signIn, response)
  }

  if (user && GUEST_ONLY.includes(pathname)) {
    const dashboard = request.nextUrl.clone()
    dashboard.pathname = '/dashboard'
    dashboard.search = ''
    return redirectWithCookies(dashboard, response)
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
