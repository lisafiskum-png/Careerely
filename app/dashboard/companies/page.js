'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function DreamCompanies() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [companies, setCompanies] = useState([])
  const [companyName, setCompanyName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [adding, setAdding] = useState(false)
  const [checking, setChecking] = useState(null)
  const [jobs, setJobs] = useState({})
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
        setUser({ id: 'dev', email: 'dev@localhost' })
        setPlan('premium')
        setAccessDenied(false)
        setLoading(false)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: profileData } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      const currentPlan = profileData?.plan || 'standard'
      setPlan(currentPlan)
      setAccessDenied(!isPlanAtLeast(currentPlan, 'premium'))
      if (isPlanAtLeast(currentPlan, 'premium')) await fetchCompanies(user.id)
      setLoading(false)
    }
    load()
  }, [])

  async function fetchCompanies(userId) {
    const { data } = await supabase.from('dream_companies').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setCompanies(data || [])
  }

  async function addCompany() {
    if (!companyName.trim()) return
    setAdding(true)
    setError('')
    const userId = user?.id === 'dev' ? null : user?.id
    if (userId) {
      await supabase.from('dream_companies').insert({ user_id: userId, company_name: companyName.trim(), keywords: keywords.trim() })
      await fetchCompanies(userId)
    } else {
      setCompanies(prev => [{ id: Date.now(), company_name: companyName.trim(), keywords: keywords.trim(), created_at: new Date().toISOString() }, ...prev])
    }
    setCompanyName('')
    setKeywords('')
    setAdding(false)
  }

  async function removeCompany(id) {
    if (user?.id !== 'dev') await supabase.from('dream_companies').delete().eq('id', id)
    setCompanies(prev => prev.filter(c => c.id !== id))
    setJobs(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  async function checkJobs(company) {
    setChecking(company.id)
    try {
      const query = company.keywords ? `${company.keywords} at ${company.company_name}` : company.company_name
      const res = await fetch('/api/job-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerms: query, location: '', experience: '' })
      })
      const data = await res.json()
      const filtered = (data.jobs || []).filter(j =>
        (j.company || '').toLowerCase().includes(company.company_name.toLowerCase()) ||
        (j.title || '').toLowerCase().includes((company.keywords || '').toLowerCase())
      ).slice(0, 5)
      setJobs(prev => ({ ...prev, [company.id]: filtered }))
      if (user?.id && user.id !== 'dev') {
        await supabase.from('dream_companies').update({ last_checked: new Date().toISOString() }).eq('id', company.id)
      }
    } catch {
      setError('Could not check jobs. Please try again.')
    }
    setChecking(null)
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
      </nav>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '50px', marginBottom: '24px' }}>🔒</div>
        <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Premium plan required</h1>
        <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto 32px' }}>
          Upgrade to Premium to monitor dream companies and get notified when they post new roles.
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
          <div>
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Dream Company Monitor</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8' }}>
              Track companies you want to work at. Check for open roles instantly whenever you want.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '999px', padding: '8px 14px', flexShrink: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#ec4899', display: 'inline-block' }} />
            <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Premium</span>
          </div>
        </div>

        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '700', marginBottom: '18px' }}>Add a company</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCompany()}
                placeholder="e.g. Stripe, Anthropic, Spotify"
                autoComplete="off"
                style={{ width: '100%', marginTop: '12px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Role keywords (optional)</label>
              <input
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCompany()}
                placeholder="e.g. product manager, engineer"
                autoComplete="off"
                style={{ width: '100%', marginTop: '12px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
          <button onClick={addCompany} disabled={adding || !companyName.trim()}
            style={{ padding: '12px 24px', borderRadius: '10px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', color: 'white', fontSize: '14px', fontWeight: '600', cursor: adding || !companyName.trim() ? 'not-allowed' : 'pointer', opacity: adding || !companyName.trim() ? 0.6 : 1 }}>
            {adding ? 'Adding...' : 'Add company'}
          </button>
        </div>

        {companies.length === 0 ? (
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#9898ad', fontSize: '14px' }}>No companies added yet. Add a company above to start monitoring.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {companies.map(company => (
              <div key={company.id} style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: jobs[company.id] ? '16px' : '0' }}>
                  <div>
                    <h3 style={{ color: 'white', fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>{company.company_name}</h3>
                    {company.keywords && <p style={{ color: '#64647a', fontSize: '12px' }}>Watching for: {company.keywords}</p>}
                    {company.last_checked && <p style={{ color: '#4b5563', fontSize: '11px', marginTop: '2px' }}>Last checked: {new Date(company.last_checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => checkJobs(company)} disabled={checking === company.id}
                      style={{ padding: '8px 16px', borderRadius: '8px', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', border: 'none', color: 'white', fontSize: '12px', fontWeight: '600', cursor: checking === company.id ? 'not-allowed' : 'pointer', opacity: checking === company.id ? 0.7 : 1 }}>
                      {checking === company.id ? 'Checking...' : 'Check jobs'}
                    </button>
                    <button onClick={() => removeCompany(company.id)}
                      style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </div>

                {jobs[company.id] !== undefined && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                    {jobs[company.id].length === 0 ? (
                      <p style={{ color: '#9898ad', fontSize: '13px' }}>No open roles found right now. Check back later.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {jobs[company.id].map((job, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                            <div>
                              <p style={{ color: '#e2e2f0', fontSize: '14px', fontWeight: '600' }}>{job.title}</p>
                              <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>{job.location} · {job.source}</p>
                            </div>
                            {job.jobUrl && (
                              <button onClick={() => window.open(job.jobUrl, '_blank')}
                                style={{ padding: '7px 14px', borderRadius: '7px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', color: 'white', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                View →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
