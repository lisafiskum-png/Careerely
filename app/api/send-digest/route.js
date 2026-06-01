import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { scrapeJobSearch } from '../../../lib/job-scraper'

export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function buildEmailHtml({ firstName, jobs, appUrl }) {
  const name = firstName || 'there'
  const jobRows = jobs.slice(0, 6).map(job => {
    const score = job.score || 0
    const scoreColor = score >= 8 ? '#22c55e' : score >= 6 ? '#eab308' : '#9898ad'
    const url = job.jobUrl || job.url || appUrl
    return `
      <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 20px;margin-bottom:10px;background:#0c0c14;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;">
            <p style="color:#ffffff;font-size:15px;font-weight:700;margin:0 0 4px;">${job.title}</p>
            <p style="color:#a78bfa;font-size:13px;margin:0 0 4px;">${job.company || 'Company'}</p>
            <p style="color:#6b7280;font-size:12px;margin:0;">${job.location || ''}${job.salary ? ' · ' + job.salary : ''}</p>
            ${job.description && job.description.length > 20 ? `<p style="color:#9898ad;font-size:12px;margin:10px 0 0;line-height:1.6;">${job.description.slice(0, 160)}…</p>` : ''}
          </div>
          ${score > 0 ? `<div style="background:rgba(${score >= 8 ? '34,197,94' : '234,179,8'},0.1);border:1px solid ${scoreColor}40;border-radius:8px;padding:6px 10px;text-align:center;margin-left:12px;flex-shrink:0;"><div style="color:${scoreColor};font-size:16px;font-weight:800;line-height:1;">${score}</div><div style="color:${scoreColor};font-size:9px;opacity:0.8;">/10</div></div>` : ''}
        </div>
        <a href="${url}" style="display:inline-block;margin-top:12px;padding:8px 16px;background:linear-gradient(135deg,#ec4899,#a855f7,#7c3aed);border-radius:8px;color:white;font-size:12px;font-weight:600;text-decoration:none;">View job →</a>
      </div>
    `
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06060b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">

    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;color:white;">Career<span style="background:linear-gradient(135deg,#ec4899,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">ely</span></span>
    </div>

    <h1 style="color:white;font-size:24px;font-weight:700;margin:0 0 8px;">Your daily Radar, ${name}</h1>
    <p style="color:#9898ad;font-size:15px;margin:0 0 28px;line-height:1.6;">Here are today's top roles picked for you by Radar.</p>

    ${jobRows.length > 0 ? jobRows : '<p style="color:#9898ad;font-size:14px;">No new matches today. Check back tomorrow.</p>'}

    <div style="margin-top:28px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <a href="${appUrl}/dashboard/jobs" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#a78bfa,#7c3aed);border-radius:10px;color:white;font-size:14px;font-weight:700;text-decoration:none;">Search more jobs →</a>
    </div>

    <p style="color:#4b5563;font-size:11px;text-align:center;margin-top:28px;">
      You're receiving this because you enabled Radar in Careerely.<br>
      <a href="${appUrl}/dashboard/profile" style="color:#6b7280;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const cronSecret = request.headers.get('x-cron-secret')
    const isCron = cronSecret === process.env.CRON_SECRET
    const isManual = body.userId

    if (!isCron && !isManual && process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://careerely.app'

    // Get users who have digest enabled
    let query = supabase.from('profiles').select('id, email, first_name, voice_sample, plan').eq('radar_enabled', true)
    if (isManual) query = query.eq('id', body.userId)

    const { data: users, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    const results = []

    for (const user of (users || [])) {
      try {
        // Derive search terms from their voice sample or default
        const searchHint = (user.voice_sample || '').slice(0, 200)
        const searchTerms = body.searchTerms || extractRole(searchHint) || 'product manager'
        const location = body.location || 'Remote'

        const jobs = await scrapeJobSearch({ query: searchTerms, location, experience: searchHint }).catch(() => [])
        const top = jobs.slice(0, 6)

        const { data: sent, error: emailError } = await resend.emails.send({
          from: 'Careerely <digest@careerely.app>',
          to: user.email,
          subject: `Your daily Radar — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
          html: buildEmailHtml({ firstName: user.first_name, jobs: top, appUrl }),
        })

        results.push({ userId: user.id, email: user.email, sent: !emailError, jobs: top.length })
      } catch (err) {
        results.push({ userId: user.id, error: err.message })
      }
    }

    return Response.json({ sent: results.length, results })
  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

function extractRole(text) {
  const roles = ['product manager', 'software engineer', 'data scientist', 'marketing manager', 'designer', 'analyst', 'developer', 'engineer', 'nurse', 'teacher', 'accountant']
  const lower = text.toLowerCase()
  return roles.find(r => lower.includes(r)) || ''
}
