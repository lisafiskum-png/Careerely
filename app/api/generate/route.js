import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const { jobDescription, userApplication, jobUrl, jobTitle, company, userId } = await request.json()

    if (!jobDescription || !userApplication) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a cover letter writer. Write a cover letter that sounds exactly like the person who wrote the sample below.

Rules:
- Match their tone, vocabulary, sentence structure, and style precisely
- Do NOT sound like AI
- Do NOT use phrases like "I am excited to apply", "I am passionate about", "I am thrilled", "dynamic", "fast-paced", "leverage"
- Do NOT open with "I am writing to apply"
- Write naturally and directly, as this specific person writes

LENGTH REQUIREMENTS — VERY IMPORTANT:
- Write exactly 4 paragraphs
- Total word count must be between 380 and 430 words
- Each paragraph 4-6 sentences
- The letter will be placed in a one-page A4 PDF with "Dear Hiring Manager" at top and "Sincerely, [name]" at bottom — your body must fill the page nicely without overflow

If a company name is provided, reference it naturally. Focus on the most relevant points from the job description.

Here is a writing sample from this person:
---
${userApplication}
---

Job details:
- Role: ${jobTitle || 'the position'}
- Company: ${company || 'the company'}
- Job description:
---
${jobDescription.slice(0, 2000)}
---

Write only the 4 body paragraphs separated by blank lines. No "Dear Hiring Manager", no sign-off, no name. Just the body.`
        }
      ]
    })

    const coverLetter = message.content[0].text

    if (userId) {
      await supabase.from('cover_letters').insert({
        user_id: userId,
        job_url: jobUrl || null,
        job_title: jobTitle || null,
        company: company || null,
        job_description: jobDescription.slice(0, 2000),
        cover_letter: coverLetter
      })
    }

    return Response.json({ coverLetter })

  } catch (error) {
    console.error(error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
