'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'
import { JOB_TITLES, LOCATIONS } from '../../../lib/job-autocomplete'

function AutocompleteInput({ value, onChange, onSelect, list, placeholder, label }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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

  function handleSelect(item) {
    onSelect(item)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
      <input
        value={value}
        onChange={handleChange}
        onFocus={() => {
          if (value.trim().length > 0 && suggestions.length > 0) setOpen(true)
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {suggestions.map(s => (
            <div
              key={s}
              onMouseDown={() => handleSelect(s)}
              style={{ padding: '12px 16px', color: '#e2e2f0', cursor: 'pointer', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function JobDiscovery() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [searchTerms, setSearchTerms] = useState('')
  const [location, setLocation] = useState('')
  const [experience, setExperience] = useState('')
  const [jobs, setJobs] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
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
      setAccessDenied(!isPlanAtLeast(currentPlan, 'pro'))
      setLoading(false)
    }
    load()
  }, [])

  async function handleSearch() {
    if (!searchTerms.trim()) {
      setError('Please enter a job title to search.')
      return
    }
    setSearching(true)
    setSearched(false)
    setError('')
    setJobs([])

    try {
      const res = await fetch('/api/job-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerms, location, experience })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else if (Array.isArray(data.jobs)) {
        setJobs(data.jobs)
      } else {
        setError('Unexpected response from job search.')
      }
    } catch (err) {
      setError('Unable to discover jobs. Please try again.')
    }

    setSearching(false)
    setSearched(true)
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
        <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Pro plan required</h1>
        <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto 32px' }}>
          Upgrade to Pro or Premium to access job discovery, automatic matching, and job scoring.
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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Job Discovery</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Find your next opportunity with AI-powered role matching tailored to your experience and target location.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#a78bfa', display: 'inline-block' }} />
            <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Pro</span>
          </div>
        </div>

        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
            <AutocompleteInput
              label="Job title"
              value={searchTerms}
              onChange={setSearchTerms}
              onSelect={setSearchTerms}
              list={JOB_TITLES}
              placeholder="Start typing a job title..."
            />
            <AutocompleteInput
              label="Location"
              value={location}
              onChange={setLocation}
              onSelect={setLocation}
              list={LOCATIONS}
              placeholder="City, country, or Remote"
            />
          </div>
          <div style={{ marginTop: '20px' }}>
            <label style={{ color: '#9898ad', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Experience profile</label>
            <textarea
              value={experience}
              onChange={e => setExperience(e.target.value)}
              placeholder="Describe your experience, skills, and specialization"
              autoComplete="off"
              style={{ width: '100%', minHeight: '140px', marginTop: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          {error && <div style={{ marginTop: '16px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
          <button
            onClick={handleSearch}
            disabled={searching}
            style={{ marginTop: '22px', padding: '14px 28px', borderRadius: '12px', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', color: 'white', fontSize: '14px', fontWeight: '700', border: 'none', cursor: searching ? 'not-allowed' : 'pointer', opacity: searching ? 0.75 : 1 }}
          >
            {searching ? 'Searching...' : 'Search jobs'}
          </button>
        </div>

        {jobs.length > 0 && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ color: '#64647a', fontSize: '13px', marginBottom: '4px' }}>{jobs.length} jobs found · sorted by match score</p>
            {jobs.map((job, index) => {
              const score = job.score || 0
              const scoreColor = score >= 8 ? '#22c55e' : score >= 6 ? '#eab308' : '#9898ad'
              const scoreBg = score >= 8 ? 'rgba(34,197,94,0.1)' : score >= 6 ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.04)'
              const url = job.jobUrl || job.url
              return (
                <div key={`${job.title}-${index}`} style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '700', marginBottom: '4px', lineHeight: 1.3 }}>{job.title || 'Job opening'}</h2>
                      <p style={{ color: '#a78bfa', fontSize: '13px', marginBottom: '4px' }}>{job.company || 'Unknown company'}</p>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {job.location && <span style={{ color: '#6b7280', fontSize: '12px' }}>{job.location}</span>}
                        {job.salary && <span style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 10px', borderRadius: '999px', fontSize: '11px' }}>{job.salary}</span>}
                        <span style={{ color: '#4b5563', fontSize: '11px' }}>{job.source}</span>
                      </div>
                      {job.description && job.description.length > 30 && (
                        <p style={{ color: '#6b7280', fontSize: '12px', lineHeight: '1.6', marginTop: '10px', maxWidth: '600px' }}>
                          {job.description.slice(0, 220)}{job.description.length > 220 ? '…' : ''}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', flexShrink: 0 }}>
                      {score > 0 && (
                        <div style={{ background: scoreBg, border: `1px solid ${scoreColor}40`, borderRadius: '10px', padding: '6px 12px', textAlign: 'center' }}>
                          <div style={{ color: scoreColor, fontSize: '18px', fontWeight: '800', lineHeight: 1 }}>{score}</div>
                          <div style={{ color: scoreColor, fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>/ 10</div>
                        </div>
                      )}
                      {url && (
                        <button
                          onClick={() => window.open(url, '_blank')}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}
                        >
                          Open job →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {searching && (
          <div style={{ textAlign: 'center', color: '#a78bfa', fontSize: '14px', marginTop: '32px' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
            Searching job boards... this takes 15–20 seconds
          </div>
        )}

        {!searching && searched && !jobs.length && !error && (
          <div style={{ textAlign: 'center', color: '#9898ad', fontSize: '14px', marginTop: '32px' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>🔍</div>
            No jobs found for <strong style={{ color: 'white' }}>{searchTerms}</strong> in <strong style={{ color: 'white' }}>{location || 'any location'}</strong>.<br />
            <span style={{ fontSize: '13px', marginTop: '8px', display: 'block' }}>Try different search terms or broaden your location.</span>
          </div>
        )}

        {!searching && !searched && (
          <div style={{ textAlign: 'center', color: '#9898ad', fontSize: '14px', marginTop: '18px' }}>
            Enter your target role and location above to discover matching jobs.
          </div>
        )}
      </div>
    </div>
  )
}
