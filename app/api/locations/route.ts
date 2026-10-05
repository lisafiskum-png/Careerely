import { getUser, unauthorizedResponse } from '../../../lib/auth'
import { parseLocationSuggestions } from '../../../lib/locations'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 5_000

export async function GET(request: Request) {
  const user = await getUser()
  if (!user) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim().slice(0, 100)
  if (query.length < 2) return Response.json({ suggestions: [] })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = new URL('https://serpapi.com/locations.json')
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '10')
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return Response.json({ suggestions: [] }, { status: 502 })
    const payload = await response.json().catch(() => null)
    return Response.json(
      { suggestions: parseLocationSuggestions(payload) },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch {
    return Response.json({ suggestions: [] }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
