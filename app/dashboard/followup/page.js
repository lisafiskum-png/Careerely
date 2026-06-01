'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function FollowUp() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [company, setCompany] = useState('Acme Inc')
  const [role, setRole] = useState('Product Manager')
  const [context, setContext] = useState('I spoke with the recruiter about my experience in digital product launches and am following up on the next interview step.')
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: profileData } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      const currentPlan = profileData?.plan || 'standard'
      setPlan(currentPlan)
      setAccessDenied(!isPlanAtLeast(currentPlan, 'premium'))
      setLoading(false)
    }
    load()
  }, [])

  async function createDraft() {
    if (!company.trim() || !role.trim() || !context.trim()) {
      setError('Please fill in all fields to generate a follow-up email.')
      return
    }
    setGenerating(true)
    setError('')
    setDraft('')

    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'followup',
          payload: { company, role, context }
        })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setDraft(data.result)
      }
    } catch (err) {
      setError('Unable to generate follow-up email. Please try again.')
    }

    setGenerating(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  if (accessDenied) return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '50px', marginBottom: '24px' }}>🔒</div>
        <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Premium plan required</h1>
        <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto 32px' }}>
          Upgrade to Premium to access application analytics, follow-up drafts, and recruiter outreach.
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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Follow-up Emails</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Draft polite, effective follow-up emails after interviews or recruiter conversations.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#ec4899', display: 'inline-block' }} />
            <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Premium</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Company</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder='Company name'
              style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
            />
            <div style={{ marginTop: '16px' }}>
              <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Role</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder='Role title'
                style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Last conversation</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder='Summarise the interview or recruiter touchpoint'
              style={{ width: '100%', minHeight: '240px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={createDraft}
            disabled={generating}
            style={{ padding: '14px 28px', borderRadius: '14px', background: 'linear-gradient(135deg,#ec4899,#7c3aed)', border: 'none', color: 'white', fontSize: '14px', cursor: generating ? 'not-allowed' : 'pointer' }}
          >
            {generating ? 'Generating...' : 'Create follow-up email'}
          </button>
          {error && <span style={{ color: '#ef4444', fontSize: '13px' }}>{error}</span>}
        </div>

        {draft && (
          <div style={{ marginTop: '28px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>Follow-up draft</h2>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#eaeaf0', fontSize: '14px', lineHeight: '1.8' }}>{draft}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
