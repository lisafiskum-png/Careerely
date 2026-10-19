import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/terms', '/privacy'],
      disallow: [
        '/api/',
        '/applications',
        '/dashboard',
        '/onboarding',
        '/opportunities',
        '/searches',
        '/settings',
      ],
    },
    sitemap: 'https://www.careerely.ai/sitemap.xml',
    host: 'https://www.careerely.ai',
  }
}
