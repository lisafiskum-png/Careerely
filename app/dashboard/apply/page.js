'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function OneClickApply() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [jobUrl, setJobUrl] = useState('')
  const [jobTitle, setJobTitle] = useState('Product Manager')
  const [company, setCompany] = useState('Acme Inc')
  const [jobDescription, setJobDescription] = useState('Manage the product roadmap, launch new features, and collaborate across design, engineering, and marketing.')
  const [userApplication, setUserApplication] = useState('Experienced product manager with a strong background in startup growth, customer research, and product launches.')
  const [coverLetter, setCoverLetter] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: profileData } = await supabase.from('profiles').select('plan, voice_sample').eq('id', user.id).single()
      const currentPlan = profileData?.plan || 'standard'
      setPlan(currentPlan)
      if (profileData?.voice_sample) {
        setUserApplication(profileData.voice_sample)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function generateApplyLetter() {
    if (!jobDescription.trim() || !userApplication.trim()) {
      setError('Please enter the job description and your writing sample.')
      return
    }
    setSubmitting(true)
    setError('')
    setCoverLetter('')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          userApplication,
          jobUrl,
          jobTitle,
          company,
          userId: user?.id
        })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setCoverLetter(data.coverLetter)
      }
    } catch (err) {
      setError('Unable to generate your application letter. Please try again.')
    }

    setSubmitting(false)
  }

  function downloadLetter() {
    const blob = new Blob([coverLetter], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cover-letter.txt'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  if (!isPlanAtLeast(plan, 'pro')) return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '50px', marginBottom: '24px' }}>🔒</div>
        <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Pro plan required</h1>
        <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto 32px' }}>
          Upgrade to Pro or Premium to access one-click applications and smart cover letter generation.
        </p>
        <button onClick={() => router.push('/')} style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', cursor: 'pointer' }}>
          View plans
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '36px' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>One-Click Apply</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Generate a tailored cover letter and keep your application ready to send in seconds.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#a78bfa', display: 'inline-block' }} />
            <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Pro</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Job URL</label>
            <input
              value={jobUrl}
              onChange={e => setJobUrl(e.target.value)}
              placeholder='Paste job posting URL'
              style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
            />
            <div style={{ marginTop: '18px' }}>
              <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Job title</label>
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder='e.g. Product Manager'
                style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
              />
            </div>
            <div style={{ marginTop: '18px' }}>
              <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Company</label>
              <input
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder='e.g. Acme Inc'
                style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Job description</label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder='Paste the job description here'
              style={{ width: '100%', minHeight: '260px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '24px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
          <h2 style={{ color: 'white', fontSize: '16px', marginBottom: '12px' }}>Writing sample</h2>
          <p style={{ color: '#64647a', fontSize: '13px', marginBottom: '14px' }}>Careerely uses this sample to match your tone. Save your voice profile in the profile section to reuse automatically.</p>
          <textarea
            value={userApplication}
            onChange={e => setUserApplication(e.target.value)}
            placeholder='Paste your previous cover letter or writing sample here'
            style={{ width: '100%', minHeight: '160px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical' }}
          />
        </div>

        {error && <div style={{ marginBottom: '18px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={generateApplyLetter}
            disabled={submitting}
            style={{ padding: '14px 28px', borderRadius: '14px', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', border: 'none', color: 'white', fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Applying...' : 'Generate application letter'}
          </button>
          {jobUrl && (
            <button
              onClick={() => window.open(jobUrl, '_blank')}
              style={{ padding: '14px 28px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#9898ad', fontSize: '14px', cursor: 'pointer' }}
            >
              Open job page
            </button>
          )}
        </div>

        {coverLetter && (
          <div style={{ marginTop: '30px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ color: 'white', fontSize: '18px', margin: '0' }}>Generated cover letter</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { navigator.clipboard.writeText(coverLetter); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#d6d6f0', cursor: 'pointer', fontSize: '13px' }}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={downloadLetter} style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(124,58,237,0.08)', color: '#a78bfa', cursor: 'pointer', fontSize: '13px' }}>
                  Download text
                </button>
              </div>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#eaeaf0', fontSize: '14px', lineHeight: '1.8', marginTop: '18px' }}>{coverLetter}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
