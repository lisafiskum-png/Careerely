'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function Analytics() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [letters, setLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const [{ data: profileData }, { data: lettersData, error }] = await Promise.all([
        supabase.from('profiles').select('plan').eq('id', user.id).single(),
        supabase.from('cover_letters').select('company, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      ])
      if (error) {
        setError('Could not load analytics data.')
      } else {
        setLetters(lettersData || [])
      }
      const currentPlan = profileData?.plan || 'standard'
      setPlan(currentPlan)
      setAccessDenied(!isPlanAtLeast(currentPlan, 'premium'))
      setLoading(false)
    }
    load()
  }, [])

  const totalApplications = letters.length
  const recentCount = letters.filter(letter => {
    const created = new Date(letter.created_at)
    return Date.now() - created.getTime() < 1000 * 60 * 60 * 24 * 30
  }).length
  const companyCounts = letters.reduce((acc, letter) => {
    const company = letter.company || 'Unknown'
    acc[company] = (acc[company] || 0) + 1
    return acc
  }, {})
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Application Analytics</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Track your applications, the companies you've targeted, and the recent activity from your job search.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#ec4899', display: 'inline-block' }} />
            <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Premium</span>
          </div>
        </div>

        {error && <div style={{ marginBottom: '24px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
            <div style={{ fontSize: '34px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>{totalApplications}</div>
            <div style={{ color: '#9898ad', fontSize: '13px' }}>Applications generated</div>
          </div>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
            <div style={{ fontSize: '34px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>{recentCount}</div>
            <div style={{ color: '#9898ad', fontSize: '13px' }}>Submitted last 30 days</div>
          </div>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
            <div style={{ fontSize: '34px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>{topCompanies.length}</div>
            <div style={{ color: '#9898ad', fontSize: '13px' }}>Companies targeted</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>Top companies</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {topCompanies.map(([company, count]) => (
                <div key={company} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ color: '#e5e7eb', fontSize: '14px' }}>{company}</span>
                  <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{count}</span>
                </div>
              ))}
              {!topCompanies.length && <p style={{ color: '#9898ad', fontSize: '13px' }}>Generate cover letters to see company analytics here.</p>}
            </div>
          </div>

          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '16px' }}>Latest activity</h2>
            {letters.slice(0, 5).map((letter, index) => (
              <div key={`${letter.company}-${index}`} style={{ marginBottom: index < letters.slice(0, 5).length - 1 ? '12px' : '0', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: '#e5e7eb', fontSize: '14px', marginBottom: '4px' }}>{letter.company || 'Unknown company'}</p>
                <p style={{ color: '#9898ad', fontSize: '12px' }}>{new Date(letter.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            ))}
            {!letters.length && <p style={{ color: '#9898ad', fontSize: '13px' }}>Your recent applications will appear here after generation.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
