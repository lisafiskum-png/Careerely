import { redirect } from 'next/navigation'

// Old sign-in URL. Kept so existing links keep working.
export default async function AuthRedirect({ searchParams }) {
  const { mode, next } = await searchParams
  if (mode === 'signup') redirect('/signup')
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
}
