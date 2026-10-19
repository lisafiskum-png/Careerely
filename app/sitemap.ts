import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.careerely.ai'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  ]
}
