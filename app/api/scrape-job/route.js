import { scrapeJobPosting } from '../../../lib/job-scraper'

export async function POST(request) {
  try {
    const { url } = await request.json()

    if (!url) {
      return Response.json({ error: 'No URL provided' }, { status: 400 })
    }

    const job = await scrapeJobPosting(url)
    if (!job.jobTitle && !job.jobDescription) {
      return Response.json({ error: 'Unable to parse job posting from this URL.' }, { status: 500 })
    }

    return Response.json(job)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Failed to fetch job posting. Try pasting the description manually.' }, { status: 500 })
  }
}
