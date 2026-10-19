import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Careerely',
    short_name: 'Careerely',
    description: 'An AI career agent that finds relevant opportunities and prepares tailored applications.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAFAFA',
    theme_color: '#FAFAFA',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
