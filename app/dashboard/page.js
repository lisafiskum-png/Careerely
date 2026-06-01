'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const FEATURES = [
  { icon: '✍️', title: 'Generate Cover Letter', desc: 'Paste a job URL and get a tailored letter', href: '/dashboard/generate', badge: null },
  { icon: '📋', title: 'My Cover Letters', desc: 'View, copy, and download your letters as PDF', href: '/dashboard/letters', badge: null },
  { icon: '🔍', title: 'Job Discovery', desc: 'Search jobs across all industries and countries', href: '/dashboard/jobs', badge: 'Pro' },
  { icon: '🎯', title: 'One-Click Apply', desc: 'Generate a cover letter and apply instantly', href: '/dashboard/apply', badge: 'Pro' },
  { icon: '🤖', title: 'AI Career Assistant', desc: 'Ask anything about your job search', href: '/dashboard/assistant', badge: 'Pro' },
  { icon: '📄', title: 'CV Builder & Review', desc: 'Build or improve your CV with AI', href: '/dashboard/cv', badge: 'Pro' },
  { icon: '📊', title: 'ATS Score', desc: 'Score your CV against any job description', href: '/dashboard/ats', badge: 'Pro' },
  { icon: '🎤', title: 'Interview Prep', desc: 'Get tailored questions and model answers', href: '/dashboard/interview', badge: 'Pro' },
  { icon: '📧', title: 'Follow-up Emails', desc: 'Draft a follow-up after your interview', href: '/dashboard/followup', badge: 'Pro' },
  { icon: '📣', title: 'Recruiter Outreach', desc: 'Write a cold outreach message to recruiters', href: '/dashboard/outreach', badge: 'Pro' },
  { icon: '💰', title: 'Salary Intelligence', desc: 'Benchmark your salary for any role and location', href: '/dashboard/salary', badge: 'Premium' },
  { icon: '🏢', title: 'Dream Companies', desc: 'Monitor companies and get alerted on new roles', href: '/dashboard/companies', badge: 'Premium' },
  { icon: '📈', title: 'Analytics', desc: 'Track your applications and activity', href: '/dashboard/analytics', badge: 'Premium' },
  { icon: '📡', title: 'Radar', desc: 'Daily email with fresh job matches tailored to you', href: '/dashboard/profile', badge: 'Pro' },
  { icon: '👤', title: 'Voice Profile', desc: 'Save your writing style for better matching', href: '/dashboard/profile', badge: null },
]

const badgeStyle = {
  Pro: { background: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
  Premium: { background: 'rgba(236,72,153,0.12)', color: '#ec4899' },
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [letters, setLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [upgraded, setUpgraded] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('upgraded') === 'true') {
        setUpgraded(true)
        window.history.replaceState({}, '', '/dashboard')
      }
    }
    async function load() {
      if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
        setUser({ email: 'dev@localhost' })
        setLoading(false)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data } = await supabase.from('cover_letters').select('id').eq('user_id', user.id)
      setLetters(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white' }}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
          <button onClick={signOut} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#9898ad', fontSize: '13px', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px' }}>
        {upgraded && (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🎉</span>
            <div>
              <p style={{ color: '#22c55e', fontWeight: '600', fontSize: '14px' }}>Plan upgraded successfully!</p>
              <p style={{ color: '#9898ad', fontSize: '13px' }}>Your new features are ready to use.</p>
            </div>
          </div>
        )}
        <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '700', marginBottom: '4px' }}>
          Welcome back{user?.email ? ', ' + user.email.split('@')[0] : ''}
        </h1>
        <p style={{ color: '#9898ad', fontSize: '15px', marginBottom: '40px' }}>
          {letters.length > 0 ? `${letters.length} cover letter${letters.length === 1 ? '' : 's'} generated so far.` : 'Your job search command centre.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {FEATURES.map(f => (
            <div
              key={f.href}
              onClick={() => router.push(f.href)}
              style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '24px', cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(167,139,250,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              {f.badge && (
                <span style={{ position: 'absolute', top: '14px', right: '14px', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '999px', ...badgeStyle[f.badge] }}>
                  {f.badge}
                </span>
              )}
              <div style={{ fontSize: '26px', marginBottom: '12px' }}>{f.icon}</div>
              <h2 style={{ color: 'white', fontSize: '14px', fontWeight: '700', marginBottom: '6px', lineHeight: 1.3 }}>{f.title}</h2>
              <p style={{ color: '#64647a', fontSize: '12px', lineHeight: '1.5' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
