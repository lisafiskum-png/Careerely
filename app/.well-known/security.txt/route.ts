const BODY = `Contact: mailto:hello@careerely.ai
Expires: 2027-10-23T00:00:00.000Z
Preferred-Languages: en, no
Canonical: https://www.careerely.ai/.well-known/security.txt
Policy: https://www.careerely.ai/privacy
`

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
