'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'
import { JOB_TITLES, LOCATIONS } from '../../../lib/job-autocomplete'

function AutocompleteInput({ value, onChange, onSelect, list, placeholder, label }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const ref = typeof window !== 'undefined' ? require('react').useRef(null) : { current: null }

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(e) {
    const val = e.target.value
    onChange(val)
    if (val.trim().length > 0) {
      const filtered = list.filter(item => item.toLowerCase().includes(val.toLowerCase())).slice(0, 8)
      setSuggestions(filtered)
      setOpen(filtered.length > 0)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
      <input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {suggestions.map(s => (
            <div key={s} onMouseDown={() => { onSelect(s); setOpen(false) }}
              style={{ padding: '12px 16px', color: '#e2e2f0', cursor: 'pointer', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SalaryIntelligence() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [experience, setExperience] = useState('mid-level')
  const [result, setResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
        setUser({ email: 'dev@localhost' })
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
      setLoading(false)
    }
    load()
  }, [])

  async function handleSearch() {
    if (!jobTitle.trim()) { setError('Please enter a job title.'); return }
    setSearching(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'salary-intelligence', payload: { jobTitle, location, experience } })
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } catch {
      setError('Unable to fetch salary data. Please try again.')
    }
    setSearching(false)
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
          Upgrade to Premium to access salary intelligence and benchmarks.
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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Salary Intelligence</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8' }}>
              Get real salary benchmarks for any role and location. Know your worth before you negotiate.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '999px', padding: '8px 14px', flexShrink: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#ec4899', display: 'inline-block' }} />
            <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Premium</span>
          </div>
        </div>

        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <AutocompleteInput label="Job title" value={jobTitle} onChange={setJobTitle} onSelect={setJobTitle} list={JOB_TITLES} placeholder="Start typing a job title..." />
            <AutocompleteInput label="Location" value={location} onChange={setLocation} onSelect={setLocation} list={LOCATIONS} placeholder="City, country, or Remote" />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Experience level</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              {['junior', 'mid-level', 'senior', 'lead'].map(level => (
                <button key={level} onClick={() => setExperience(level)}
                  style={{ padding: '10px 18px', borderRadius: '10px', border: `1px solid ${experience === level ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`, background: experience === level ? 'rgba(167,139,250,0.12)' : 'transparent', color: experience === level ? '#a78bfa' : '#9898ad', fontSize: '13px', cursor: 'pointer', fontWeight: experience === level ? '700' : '400', textTransform: 'capitalize' }}>
                  {level}
                </button>
              ))}
            </div>
          </div>
          {error && <div style={{ marginBottom: '16px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
          <button onClick={handleSearch} disabled={searching}
            style={{ padding: '14px 28px', borderRadius: '12px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', color: 'white', fontSize: '14px', fontWeight: '700', border: 'none', cursor: searching ? 'not-allowed' : 'pointer', opacity: searching ? 0.75 : 1 }}>
            {searching ? 'Analysing...' : 'Get salary data'}
          </button>
        </div>

        {result && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { label: 'Junior', value: result.junior, color: '#6b7280' },
                { label: 'Median', value: result.median, color: '#a78bfa', highlight: true },
                { label: 'Senior', value: result.senior, color: '#22c55e' },
              ].map(({ label, value, color, highlight }) => (
                <div key={label} style={{ background: highlight ? 'rgba(167,139,250,0.06)' : '#0c0c14', border: `1px solid ${highlight ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ color: '#9898ad', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>{label}</div>
                  <div style={{ color, fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>{value}</div>
                  <div style={{ color: '#64647a', fontSize: '11px' }}>{result.period} · {result.currency}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
                <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '700', marginBottom: '14px' }}>Top paying industries</h3>
                {(result.topPayingIndustries || []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '700', width: '18px' }}>#{i + 1}</span>
                    <span style={{ color: '#e2e2f0', fontSize: '13px' }}>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
                <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '700', marginBottom: '14px' }}>Top paying locations</h3>
                {(result.topPayingLocations || []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: '700', width: '18px' }}>#{i + 1}</span>
                    <span style={{ color: '#e2e2f0', fontSize: '13px' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
              <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '700', marginBottom: '14px' }}>What affects your pay</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(result.keyFactors || []).map((f, i) => (
                  <span key={i} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', color: '#9898ad', fontSize: '12px' }}>{f}</span>
                ))}
              </div>
            </div>

            {result.negotiationTip && (
              <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '16px', padding: '22px' }}>
                <h3 style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Negotiation tip</h3>
                <p style={{ color: '#e2e2f0', fontSize: '14px', lineHeight: '1.7' }}>{result.negotiationTip}</p>
              </div>
            )}

            {result.insight && (
              <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px' }}>
                <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '700', marginBottom: '10px' }}>Market insight</h3>
                <p style={{ color: '#9898ad', fontSize: '14px', lineHeight: '1.7' }}>{result.insight}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
