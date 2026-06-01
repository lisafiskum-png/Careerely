import { scrapeJobSearch } from '../../../lib/job-scraper'

export const maxDuration = 60

export async function POST(request) {
  try {
    const { searchTerms, location, experience } = await request.json()
    const query = searchTerms || ''
    if (!query.trim()) {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    console.log('SERPAPI_KEY present:', !!process.env.SERPAPI_KEY)
    const jobs = await scrapeJobSearch({ query, location, experience })
    console.log('Jobs returned:', jobs.length)
    return Response.json({ jobs })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error.message || 'Failed to search jobs' }, { status: 500 })
  }
}
