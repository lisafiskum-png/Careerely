'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function ATSScore() {
  const [user, setUser] = useState(null)
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)
    }
    load()
  }, [])

  async function handleScore() {
    if (!resumeText.trim() || !jobDescription.trim()) {
      setError('Paste both your resume and the job description.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'ats-score', payload: { resumeText, jobDescription } })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError('Unable to score your resume. Please try again.')
    }

    setLoading(false)
  }

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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>ATS Score</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Paste your resume and the job description to get a quick ATS fit score, keyword recommendations, and targeted feedback.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#22c55e', display: 'inline-block' }} />
            <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Standard</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Resume / CV text</label>
            <textarea
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
              placeholder="Paste your resume or CV here..."
              style={{ width: '100%', minHeight: '220px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', lineHeight: '1.6', outline: 'none', fontFamily: 'sans-serif', resize: 'vertical' }}
            />
          </div>

          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Job description</label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
              style={{ width: '100%', minHeight: '220px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', lineHeight: '1.6', outline: 'none', fontFamily: 'sans-serif', resize: 'vertical' }}
            />
          </div>
        </div>

        {error && <div style={{ marginTop: '16px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}

        <button
          onClick={handleScore}
          disabled={loading}
          style={{ marginTop: '22px', padding: '14px 26px', borderRadius: '12px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', color: 'white', fontSize: '14px', fontWeight: '700', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Scoring...' : 'Run ATS Score'}
        </button>

        {result && (
          <div style={{ marginTop: '30px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.15)', borderRadius: '16px', padding: '18px' }}>
                <div style={{ color: '#a78bfa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>ATS Fit Score</div>
                <div style={{ color: 'white', fontSize: '42px', fontWeight: '800' }}>{result.score || '—'}</div>
              </div>
              <div style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '16px', padding: '18px' }}>
                <div style={{ color: '#a78bfa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Top keywords</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(result.topKeywords || []).map(keyword => (
                    <span key={keyword} style={{ color: '#eaeaf0', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '999px', fontSize: '12px' }}>{keyword}</span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '12px' }}>Feedback</h2>
              <p style={{ color: '#eaeaf0', whiteSpace: 'pre-wrap', lineHeight: '1.75' }}>{result.feedback}</p>
            </div>
          </div>
        )}

        <button onClick={() => router.push('/dashboard')} style={{ marginTop: '30px', padding: '12px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#9898ad', fontSize: '14px', cursor: 'pointer' }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}
