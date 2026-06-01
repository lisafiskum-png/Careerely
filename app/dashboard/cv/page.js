'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function CVReview() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [resumeText, setResumeText] = useState('')
  const [review, setReview] = useState('')
  const [builderResult, setBuilderResult] = useState('')
  const [targetRole, setTargetRole] = useState('Product Manager')
  const [experience, setExperience] = useState('3 years building SaaS products, working with cross-functional teams, and improving customer retention')
  const [loading, setLoading] = useState(false)
  const [builderLoading, setBuilderLoading] = useState(false)
  const [error, setError] = useState('')
  const [builderError, setBuilderError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: profileData } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      setPlan(profileData?.plan || 'standard')
    }
    load()
  }, [])

  async function handleReview() {
    if (!resumeText.trim()) {
      setError('Paste your resume or CV text to get feedback.')
      return
    }
    setLoading(true)
    setError('')
    setReview('')

    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'cv-review', payload: { resumeText } })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setReview(data.result)
      }
    } catch (err) {
      setError('Unable to generate review. Please try again.')
    }

    setLoading(false)
  }

  async function buildCV() {
    if (!targetRole.trim() || !experience.trim()) {
      setBuilderError('Fill in the target role and your experience summary.')
      return
    }
    setBuilderLoading(true)
    setBuilderError('')
    setBuilderResult('')

    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'cv-builder',
          payload: { targetRole, experience, resumeText }
        })
      })
      const data = await res.json()
      if (data.error) {
        setBuilderError(data.error)
      } else {
        setBuilderResult(data.result)
      }
    } catch (err) {
      setBuilderError('Unable to generate a CV. Please try again.')
    }

    setBuilderLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '36px' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>CV Review</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Paste your CV text and Careerely will highlight what is strong, what is weak, and which ATS keywords you should add.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#22c55e', display: 'inline-block' }} />
            <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Standard</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Paste your CV</label>
            <textarea
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
              placeholder="Paste your resume or CV text here..."
              style={{ width: '100%', minHeight: '320px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', lineHeight: '1.6', outline: 'none', fontFamily: 'sans-serif', resize: 'vertical' }}
            />
            {error && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
            <button
              onClick={handleReview}
              disabled={loading}
              style={{ marginTop: '18px', padding: '14px 26px', borderRadius: '12px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', color: 'white', fontSize: '14px', fontWeight: '700', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Reviewing...' : 'Run CV Review'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
              <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '10px' }}>How it works</h2>
              <ul style={{ color: '#9898ad', fontSize: '13px', lineHeight: '1.75', paddingLeft: '18px' }}>
                <li>Paste your resume text — no file upload needed.</li>
                <li>Get strengths, improvement opportunities, and ATS keyword suggestions.</li>
                <li>Use the recommendations to update your resume for each role.</li>
              </ul>
            </div>
            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
              <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '10px' }}>Output</h2>
              <p style={{ color: '#64647a', fontSize: '13px', lineHeight: '1.7' }}>Review results appear here once the analysis completes. You can copy the suggestions into your resume editor.</p>
            </div>
          </div>
        </div>

        {review && (
          <div style={{ marginTop: '26px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>Review results</h2>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#eaeaf0', fontSize: '14px', lineHeight: '1.8' }}>{review}</pre>
          </div>
        )}

        <div style={{ marginTop: '52px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '24px' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h2 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>CV Builder</h2>
              <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
                Generate a polished CV structure from your experience and target role. Exclusive to Pro and Premium plans.
              </p>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#a78bfa', display: 'inline-block' }} />
              <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Pro</span>
            </div>
          </div>

          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '20px' }}>
              <div>
                <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Target role</label>
                <input
                  value={targetRole}
                  onChange={e => setTargetRole(e.target.value)}
                  placeholder='e.g. Senior Product Manager'
                  style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none' }}
                  disabled={!isPlanAtLeast(plan, 'pro')}
                />
                <div style={{ marginTop: '18px' }}>
                  <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Your experience</label>
                  <textarea
                    value={experience}
                    onChange={e => setExperience(e.target.value)}
                    placeholder='Summarize your background, achievements, and strengths.'
                    style={{ width: '100%', minHeight: '180px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical' }}
                    disabled={!isPlanAtLeast(plan, 'pro')}
                  />
                </div>
              </div>
              <div>
                <label style={{ color: '#9898ad', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Existing CV text (optional)</label>
                <textarea
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder='Paste your current CV if you want the builder to reuse details.'
                  style={{ width: '100%', minHeight: '300px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical' }}
                  disabled={!isPlanAtLeast(plan, 'pro')}
                />
              </div>
            </div>
            {builderError && <div style={{ marginTop: '18px', color: '#ef4444', fontSize: '13px' }}>{builderError}</div>}
            <button
              onClick={buildCV}
              disabled={builderLoading || !isPlanAtLeast(plan, 'pro')}
              style={{ marginTop: '22px', padding: '14px 26px', borderRadius: '12px', background: isPlanAtLeast(plan, 'pro') ? 'linear-gradient(135deg,#a78bfa,#7c3aed)' : 'rgba(124,58,237,0.15)', color: 'white', fontSize: '14px', fontWeight: '700', border: 'none', cursor: builderLoading || !isPlanAtLeast(plan, 'pro') ? 'not-allowed' : 'pointer', opacity: builderLoading || !isPlanAtLeast(plan, 'pro') ? 0.65 : 1 }}
            >
              {builderLoading ? 'Building your CV...' : 'Build CV'}
            </button>
            {!isPlanAtLeast(plan, 'pro') && (
              <p style={{ marginTop: '14px', color: '#9898ad', fontSize: '13px' }}>Upgrade to Pro to unlock CV builder and structure your resume automatically.</p>
            )}
          </div>

          {builderResult && (
            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
              <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>Generated CV</h2>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#eaeaf0', fontSize: '14px', lineHeight: '1.8' }}>{builderResult}</pre>
            </div>
          )}
        </div>

        <button onClick={() => router.push('/dashboard')} style={{ marginTop: '30px', padding: '12px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#9898ad', fontSize: '14px', cursor: 'pointer' }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}
