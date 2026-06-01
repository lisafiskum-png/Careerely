import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(task, payload) {
  switch (task) {
    case 'cv-review': {
      const { resumeText } = payload
      return `You are a career coach and resume editor. Review the resume text below and provide:
- A concise summary of the candidate's strengths
- Three specific opportunities to improve formatting, language, or impact
- The top skills and keywords missing for applicant tracking systems
- A final recommendation for the next revision

Resume text:
${resumeText}`
    }
    case 'ats-score': {
      const { resumeText, jobDescription } = payload
      return `You are an expert ATS reviewer. Score the candidate's resume against the job description on a scale of 1-100.
Return ONLY valid JSON with keys: score, topKeywords, feedback.
Top keywords should be an array of 5-8 terms.
Feedback should be a short paragraph with concrete fixes.

Resume:
${resumeText}

Job description:
${jobDescription}`
    }
    case 'job-discovery': {
      const { searchTerms, location, experience } = payload
      return `You are a smart job discovery engine for career seekers.
Based on the target search terms, location, and candidate experience profile below, return ONLY valid JSON with this shape:
{
  "jobs": [
    { "title": "", "company": "", "location": "", "salary": "", "fitScore": "", "tags": [""], "jobUrl": "" }
  ]
}
Generate 5 strong job matches with realistic companies and roles.
Candidate experience:
${experience}

Target search:
${searchTerms}
Location:
${location}`
    }
    case 'assistant': {
      const { conversation } = payload
      const conversationText = conversation.map((m, index) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.message}`).join('\n')
      return `You are a helpful AI career assistant. Continue the conversation below with a friendly, practical answer.
Do not say you are an AI model. Keep responses concise and actionable.

Conversation:
${conversationText}`
    }
    case 'interview-prep': {
      const { jobTitle, company, experience } = payload
      return `You are an interview coach. Create a tailored interview prep guide for a candidate applying to ${jobTitle} at ${company}.
Include:
- 5 likely interview questions
- 2 strong answer bullets for each question based on the candidate experience below
- 3 suggested questions the candidate should ask the interviewer

Candidate experience:
${experience}`
    }
    case 'followup': {
      const { company, role, context } = payload
      return `Write a professional follow-up email to the hiring team for the ${role} role at ${company}.
Reference the candidate's recent conversation or interview context below.
Keep it polite, concise, and ready to send.

Context:
${context}`
    }
    case 'outreach': {
      const { company, role, intro } = payload
      return `Write a recruiter outreach message to a hiring manager or recruiter at ${company} for a ${role} role.
Use the introduction below and keep the tone confident, concise, and human.

Intro:
${intro}`
    }
    case 'salary-intelligence': {
      const { jobTitle, location, experience } = payload
      return `You are a salary intelligence expert with up-to-date knowledge of global compensation benchmarks.
For the role "${jobTitle}" in "${location || 'global market'}" with experience level "${experience || 'mid-level'}", provide:

Return ONLY valid JSON with this exact shape:
{
  "median": "$X,XXX–$X,XXX",
  "junior": "$X,XXX–$X,XXX",
  "senior": "$X,XXX–$X,XXX",
  "currency": "USD (or local currency)",
  "period": "per year",
  "topPayingIndustries": ["industry1", "industry2", "industry3"],
  "topPayingLocations": ["city1", "city2", "city3"],
  "keyFactors": ["factor affecting pay 1", "factor affecting pay 2", "factor affecting pay 3"],
  "negotiationTip": "One concrete tip for negotiating this role's salary.",
  "insight": "2-3 sentence market insight about this role's compensation trends."
}`
    }
    case 'cv-builder': {
      const { targetRole, experience, resumeText } = payload
      return `You are a resume expert. Create a polished, easy-to-read CV for a candidate targeting ${targetRole}.
Include a professional summary, experience section, skills list, and optional education section.
Use the candidate profile below and weave in achievements, outcomes, and strong action language.
If resume text is available, incorporate any useful details from it.
Return plain text only, with clear section headings.

Candidate profile:
${experience}

Current resume text:
${resumeText || 'N/A'}`
    }
    default:
      return ''
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { task, payload } = body

    if (!task) {
      return Response.json({ error: 'Missing task' }, { status: 400 })
    }

    const prompt = buildPrompt(task, payload)
    if (!prompt) {
      return Response.json({ error: 'Unknown task' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    })

    const text = message.content?.[0]?.text || ''

    if (task === 'ats-score' || task === 'job-discovery' || task === 'salary-intelligence') {
      try {
        const cleaned = text.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        return Response.json(parsed)
      } catch (parseError) {
        return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
      }
    }

    return Response.json({ result: text })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
