'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Generate() {
  const [user, setUser] = useState(null)
  const [jobUrl, setJobUrl] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [userApplication, setUserApplication] = useState('')
  const [hasVoiceProfile, setHasVoiceProfile] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [scraping, setScraping] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [jobFetched, setJobFetched] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data } = await supabase.from('profiles').select('voice_sample').eq('id', user.id).single()
      if (data?.voice_sample) {
        setUserApplication(data.voice_sample)
        setHasVoiceProfile(true)
      }
    }
    load()
  }, [])

  async function scrapeJob() {
    if (!jobUrl) return
    setScraping(true)
    setError('')
    setJobFetched(false)
    try {
      const res = await fetch('/api/scrape-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobUrl })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setJobDescription(data.jobDescription)
        setJobTitle(data.jobTitle || '')
        setCompany(data.company || '')
        setJobFetched(true)
      }
    } catch (e) {
      setError('Could not fetch that URL. Try pasting the description manually.')
    }
    setScraping(false)
  }

  async function generate() {
    if (!jobDescription || !userApplication) {
      setError('Please add a job description first')
      return
    }
    setLoading(true)
    setError('')
    setCoverLetter('')
    setCopied(false)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          userApplication,
          jobUrl,
          jobTitle: jobTitle || 'Job Application',
          company,
          userId: user?.id
        })
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setCoverLetter(data.coverLetter)
    } catch (e) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function reset() {
    setJobUrl('')
    setJobTitle('')
    setCompany('')
    setJobDescription('')
    setCoverLetter('')
    setJobFetched(false)
    setError('')
  }

  const s = {
    page: { minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' },
    nav: { padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    logo: { fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' },
    logoSpan: { background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    container: { maxWidth: '800px', margin: '0 auto', padding: '48px 24px' },
    card: { background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '28px', marginBottom: '16px' },
    label: { color: '#eaeaf0', fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' },
    sublabel: { color: '#64647a', fontSize: '12px', marginBottom: '10px', display: 'block' },
    input: { width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'sans-serif', boxSizing: 'border-box' },
    textarea: { width: '100%', height: '180px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: 'white', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'sans-serif', lineHeight: '1.6', boxSizing: 'border-box' },
    btn: { padding: '12px 28px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
    btnDisabled: { padding: '12px 28px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'not-allowed', opacity: '0.5', whiteSpace: 'nowrap' },
    btnOutline: { padding: '10px 20px', background: 'transparent', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '8px', color: '#a78bfa', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
    row: { display: 'flex', gap: '12px' },
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.logo} onClick={() => router.push('/dashboard')}>
          Career<span style={s.logoSpan}>ely</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span
            style={{ color: hasVoiceProfile ? '#22c55e' : '#f59e0b', fontSize: '13px', cursor: 'pointer' }}
            onClick={() => router.push('/dashboard/profile')}
          >
            {hasVoiceProfile ? '✓ Voice profile saved' : '⚠ Set up voice profile'}
          </span>
          <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
        </div>
      </nav>

      <div style={s.container}>
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: '700', marginBottom: '6px' }}>Generate Cover Letter</h1>
          <p style={{ color: '#9898ad', fontSize: '14px' }}>Paste a job URL or description and get a tailored letter in your voice.</p>
        </div>

        <div style={s.card}>
          <label style={s.label}>Job URL</label>
          <span style={s.sublabel}>We'll fetch and extract the job details automatically</span>
          <div style={{ ...s.row, marginBottom: jobFetched ? '16px' : '0' }}>
            <input
              style={s.input}
              placeholder="https://company.com/jobs/role"
              value={jobUrl}
              onChange={e => { setJobUrl(e.target.value); setJobFetched(false) }}
              onKeyDown={e => e.key === 'Enter' && scrapeJob()}
            />
            <button onClick={scrapeJob} disabled={scraping || !jobUrl} style={scraping || !jobUrl ? s.btnDisabled : s.btn}>
              {scraping ? 'Fetching...' : 'Fetch Job'}
            </button>
          </div>

          {jobFetched && (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: '10px', padding: '16px', marginTop: '12px' }}>
              <p style={{ color: '#22c55e', fontSize: '12px', marginBottom: '12px', fontWeight: '600' }}>✓ Job fetched — review and edit if needed</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ ...s.label, color: '#9898ad', fontSize: '11px', marginBottom: '4px' }}>JOB TITLE</label>
                  <input
                    style={{ ...s.input, fontSize: '13px', padding: '10px 14px' }}
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="e.g. Business Development Manager"
                  />
                </div>
                <div>
                  <label style={{ ...s.label, color: '#9898ad', fontSize: '11px', marginBottom: '4px' }}>COMPANY</label>
                  <input
                    style={{ ...s.input, fontSize: '13px', padding: '10px 14px' }}
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Bitpanda"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {!jobFetched && (
          <div style={s.card}>
            <label style={s.label}>Or paste the job description manually</label>
            <span style={s.sublabel}>If the URL fetch doesn't work, paste the description here</span>
            <textarea
              style={s.textarea}
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
            />
            {jobDescription && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <label style={{ ...s.label, fontSize: '11px', color: '#9898ad', marginBottom: '4px' }}>JOB TITLE</label>
                  <input style={{ ...s.input, fontSize: '13px', padding: '10px 14px' }} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Business Development Manager" />
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: '11px', color: '#9898ad', marginBottom: '4px' }}>COMPANY</label>
                  <input style={{ ...s.input, fontSize: '13px', padding: '10px 14px' }} value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Bitpanda" />
                </div>
              </div>
            )}
          </div>
        )}

        {!hasVoiceProfile && (
          <div style={s.card}>
            <label style={s.label}>Your Writing Sample</label>
            <span style={s.sublabel}>
              Paste a previous cover letter so we can match your voice. Or{' '}
              <span style={{ color: '#a78bfa', cursor: 'pointer' }} onClick={() => router.push('/dashboard/profile')}>
                save your voice profile
              </span>{' '}
              to skip this every time.
            </span>
            <textarea
              style={s.textarea}
              placeholder="Paste your previous cover letter here..."
              value={userApplication}
              onChange={e => setUserApplication(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ color: '#ef4444', fontSize: '13px' }}>{error}</p>
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading || (!jobDescription && !jobFetched)}
          style={loading || (!jobDescription && !jobFetched) ? { ...s.btnDisabled, width: '100%', padding: '14px' } : { ...s.btn, width: '100%', padding: '14px' }}
        >
          {loading ? 'Generating your cover letter...' : 'Generate Cover Letter'}
        </button>

        {coverLetter && (
          <div style={{ background: '#0c0c14', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '14px', padding: '32px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                {jobTitle && <p style={{ color: 'white', fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>{jobTitle}{company ? ` at ${company}` : ''}</p>}
                <p style={{ color: '#64647a', fontSize: '12px' }}>Cover letter generated</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={copyToClipboard} style={{ ...s.btnOutline, background: copied ? 'rgba(34,197,94,0.1)' : 'transparent', borderColor: copied ? 'rgba(34,197,94,0.3)' : 'rgba(124,58,237,0.3)', color: copied ? '#22c55e' : '#a78bfa' }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button onClick={reset} style={{ ...s.btnOutline, borderColor: 'rgba(255,255,255,0.08)', color: '#64647a' }}>
                  New Letter
                </button>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
              <p style={{ color: '#eaeaf0', fontSize: '14px', lineHeight: '1.9', whiteSpace: 'pre-wrap' }}>{coverLetter}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
