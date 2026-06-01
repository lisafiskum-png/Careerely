'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const PLAN_HIERARCHY = { standard: 0, pro: 1, premium: 2 }

const NAV_ITEMS = [
  { icon: '⊞', label: 'Dashboard', href: '/dashboard', minPlan: 'standard' },
  { icon: '✍️', label: 'Cover Letter', href: '/dashboard/generate', minPlan: 'standard' },
  { icon: '📋', label: 'My Letters', href: '/dashboard/letters', minPlan: 'standard' },
  { icon: '🔍', label: 'Job Discovery', href: '/dashboard/jobs', minPlan: 'pro', badge: 'Pro' },
  { icon: '🎯', label: 'One-Click Apply', href: '/dashboard/apply', minPlan: 'pro', badge: 'Pro' },
  { icon: '🤖', label: 'AI Assistant', href: '/dashboard/assistant', minPlan: 'pro', badge: 'Pro' },
  { icon: '📄', label: 'CV Builder', href: '/dashboard/cv', minPlan: 'pro', badge: 'Pro' },
  { icon: '📊', label: 'ATS Score', href: '/dashboard/ats', minPlan: 'pro', badge: 'Pro' },
  { icon: '🎤', label: 'Interview Prep', href: '/dashboard/interview', minPlan: 'pro', badge: 'Pro' },
  { icon: '📧', label: 'Follow-up', href: '/dashboard/followup', minPlan: 'pro', badge: 'Pro' },
  { icon: '📣', label: 'Outreach', href: '/dashboard/outreach', minPlan: 'pro', badge: 'Pro' },
  { icon: '💰', label: 'Salary Intel', href: '/dashboard/salary', minPlan: 'premium', badge: 'Premium' },
  { icon: '🏢', label: 'Dream Companies', href: '/dashboard/companies', minPlan: 'premium', badge: 'Premium' },
  { icon: '📈', label: 'Analytics', href: '/dashboard/analytics', minPlan: 'premium', badge: 'Premium' },
  { icon: '📡', label: 'Radar', href: '/dashboard/radar', minPlan: 'pro', badge: 'Pro' },
  { icon: '👤', label: 'Profile', href: '/dashboard/profile', minPlan: 'standard' },
]

const PLAN_THEME = {
  standard: {
    label: 'Standard',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.1)',
    border: 'rgba(34,197,94,0.25)',
    gradient: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.08))',
    sideBorder: 'rgba(34,197,94,0.15)',
  },
  pro: {
    label: 'Pro',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.1)',
    border: 'rgba(167,139,250,0.25)',
    gradient: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(167,139,250,0.08))',
    sideBorder: 'rgba(124,58,237,0.2)',
  },
  premium: {
    label: 'Premium',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.1)',
    border: 'rgba(236,72,153,0.25)',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.15), rgba(168,85,247,0.08))',
    sideBorder: 'rgba(236,72,153,0.2)',
  },
}

const BADGE_COLORS = {
  Pro: { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  Premium: { bg: 'rgba(236,72,153,0.15)', color: '#ec4899' },
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: '#64647a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>{label}</span>
        <span style={{ fontSize: '18px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: '700', color, letterSpacing: '-1px' }}>{value}</div>
    </div>
  )
}

function LockedCard({ icon, title, desc, badge, onClick }) {
  const bc = BADGE_COLORS[badge] || {}
  return (
    <div
      onClick={onClick}
      style={{ background: '#0a0a12', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', padding: '20px', cursor: 'pointer', opacity: 0.55, position: 'relative', transition: 'opacity 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
    >
      <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: bc.bg, color: bc.color }}>{badge}</span>
      <div style={{ fontSize: '24px', marginBottom: '10px', filter: 'grayscale(0.6)' }}>{icon}</div>
      <div style={{ position: 'absolute', top: '50%', right: '16px', fontSize: '16px', opacity: 0.4 }}>🔒</div>
      <h3 style={{ color: '#9898ad', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>{title}</h3>
      <p style={{ color: '#44445a', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>{desc}</p>
    </div>
  )
}

function ActionCard({ icon, title, desc, onClick, gradient, accent }) {
  const base = {
    background: gradient || '#0c0c14',
    border: `1px solid ${accent ? accent + '40' : 'rgba(255,255,255,0.06)'}`,
    borderRadius: '14px', padding: '20px', cursor: 'pointer',
    transition: 'border-color 0.15s, transform 0.15s', position: 'relative',
  }
  return (
    <div
      onClick={onClick}
      style={base}
      onMouseEnter={e => { e.currentTarget.style.borderColor = (accent || '#a78bfa') + '70'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = accent ? accent + '40' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ fontSize: '24px', marginBottom: '10px' }}>{icon}</div>
      <h3 style={{ color: 'white', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>{title}</h3>
      <p style={{ color: '#64647a', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>{desc}</p>
    </div>
  )
}

function StandardContent({ letters, recentLetters, router }) {
  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
        <StatCard label="Cover Letters" value={letters.length} icon="✍️" color="#22c55e" />
        <StatCard label="This Week" value={letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 7 * 86400000)).length} icon="📅" color="#a78bfa" />
        <StatCard label="Plan" value="Standard" icon="⭐" color="#22c55e" />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '14px', letterSpacing: '-0.3px' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <ActionCard
            icon="✍️" title="Generate Cover Letter" desc="Paste a job URL and get a tailored letter instantly"
            gradient="linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.06))" accent="#22c55e"
            onClick={() => router.push('/dashboard/generate')}
          />
          <ActionCard
            icon="📋" title="My Letters" desc="View, copy and manage all your generated letters"
            onClick={() => router.push('/dashboard/letters')}
          />
          <ActionCard
            icon="👤" title="Your Profile" desc="Update your experience and preferences"
            onClick={() => router.push('/dashboard/profile')}
          />
          <LockedCard icon="🔍" title="Job Discovery" desc="Search jobs across all industries worldwide" badge="Pro" onClick={() => router.push('/#pricing')} />
          <LockedCard icon="🤖" title="AI Career Assistant" desc="Ask anything about your job search" badge="Pro" onClick={() => router.push('/#pricing')} />
          <LockedCard icon="📊" title="ATS Score" desc="Score your CV against any job description" badge="Pro" onClick={() => router.push('/#pricing')} />
        </div>
      </div>

      {/* Recent letters */}
      <RecentLetters letters={recentLetters} router={router} />

      {/* Upgrade CTA */}
      <div style={{ marginTop: '28px', background: 'linear-gradient(135deg, rgba(124,58,237,0.14), rgba(236,72,153,0.08))', border: '1px solid rgba(124,58,237,0.28)', borderRadius: '16px', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ color: 'white', fontSize: '16px', fontWeight: '700', margin: '0 0 6px' }}>Unlock the full Careerely suite</h3>
            <p style={{ color: '#9898ad', fontSize: '13px', margin: '0 0 10px' }}>Job discovery, AI assistant, interview prep, one-click apply and more.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['🔍 Job Discovery', '🤖 AI Assistant', '🎤 Interview Prep', '📊 ATS Score'].map(f => (
                <span key={f} style={{ fontSize: '12px', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: '6px', padding: '3px 10px' }}>{f}</span>
              ))}
            </div>
          </div>
          <button onClick={() => router.push('/#pricing')} style={{ padding: '13px 28px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>
            Upgrade to Pro →
          </button>
        </div>
      </div>
    </>
  )
}

function ProContent({ letters, recentLetters, router }) {
  const thisWeek = letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 7 * 86400000)).length
  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        <StatCard label="Cover Letters" value={letters.length} icon="✍️" color="#a78bfa" />
        <StatCard label="This Week" value={thisWeek} icon="📅" color="#ec4899" />
        <StatCard label="Plan" value="Pro" icon="⚡" color="#a78bfa" />
        <StatCard label="Status" value="Active" icon="✅" color="#22c55e" />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '14px', letterSpacing: '-0.3px' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <ActionCard icon="✍️" title="Generate Cover Letter" desc="Tailored letters from any job URL in seconds" gradient="linear-gradient(135deg,rgba(124,58,237,0.15),rgba(167,139,250,0.08))" accent="#a78bfa" onClick={() => router.push('/dashboard/generate')} />
          <ActionCard icon="🔍" title="Job Discovery" desc="Search millions of jobs across all industries" accent="#a78bfa" onClick={() => router.push('/dashboard/jobs')} />
          <ActionCard icon="🤖" title="AI Career Assistant" desc="Your personal career coach, available 24/7" accent="#a78bfa" onClick={() => router.push('/dashboard/assistant')} />
          <ActionCard icon="📊" title="ATS Score" desc="See how your CV ranks against the job description" accent="#a78bfa" onClick={() => router.push('/dashboard/ats')} />
          <ActionCard icon="🎤" title="Interview Prep" desc="Tailored questions and model answers per role" accent="#a78bfa" onClick={() => router.push('/dashboard/interview')} />
          <ActionCard icon="📄" title="CV Builder" desc="Build a recruiter-ready CV in minutes" accent="#a78bfa" onClick={() => router.push('/dashboard/cv')} />
        </div>
      </div>

      {/* Job pipeline + recent letters side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        {/* Job pipeline placeholder */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ color: 'white', fontSize: '15px', fontWeight: '600', margin: '0 0 14px', letterSpacing: '-0.3px' }}>Job Pipeline</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {['Saved', 'Applied', 'Interview', 'Offer'].map((stage, i) => (
              <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(167,139,250,0.05)', borderRadius: '8px' }}>
                <span style={{ color: '#c8c8d8', fontSize: '13px', fontWeight: '500' }}>{stage}</span>
                <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{[0, 0, 0, 0][i]}</span>
              </div>
            ))}
          </div>
          <button onClick={() => router.push('/dashboard/jobs')} style={{ marginTop: '14px', width: '100%', padding: '10px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '8px', color: '#a78bfa', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Find Jobs →
          </button>
        </div>

        {/* More tools */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ color: 'white', fontSize: '15px', fontWeight: '600', margin: '0 0 14px', letterSpacing: '-0.3px' }}>More Tools</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { icon: '🎯', label: 'One-Click Apply', href: '/dashboard/apply' },
              { icon: '📧', label: 'Follow-up Emails', href: '/dashboard/followup' },
              { icon: '📣', label: 'Cold Outreach', href: '/dashboard/outreach' },
              { icon: '📡', label: 'Job Radar', href: '/dashboard/radar' },
            ].map(t => (
              <div key={t.href} onClick={() => router.push(t.href)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <span style={{ fontSize: '16px' }}>{t.icon}</span>
                <span style={{ color: '#c8c8d8', fontSize: '13px', fontWeight: '500' }}>{t.label}</span>
                <span style={{ marginLeft: 'auto', color: '#a78bfa', fontSize: '12px' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RecentLetters letters={recentLetters} router={router} />

      {/* Upgrade to premium CTA */}
      <div style={{ marginTop: '28px', background: 'linear-gradient(135deg, rgba(236,72,153,0.1), rgba(168,85,247,0.06))', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '16px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'white', fontSize: '15px', fontWeight: '700', margin: '0 0 4px' }}>Go further with Premium</h3>
          <p style={{ color: '#9898ad', fontSize: '13px', margin: 0 }}>Salary intel, dream company tracking, advanced analytics.</p>
        </div>
        <button onClick={() => router.push('/#pricing')} style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#ec4899,#a855f7)', border: 'none', borderRadius: '8px', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          Upgrade to Premium →
        </button>
      </div>
    </>
  )
}

function PremiumContent({ letters, recentLetters, router }) {
  const thisWeek = letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 7 * 86400000)).length
  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        <StatCard label="Cover Letters" value={letters.length} icon="✍️" color="#ec4899" />
        <StatCard label="This Week" value={thisWeek} icon="📅" color="#a78bfa" />
        <StatCard label="Plan" value="Premium" icon="👑" color="#ec4899" />
        <StatCard label="Status" value="Active" icon="✅" color="#22c55e" />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '14px', letterSpacing: '-0.3px' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <ActionCard icon="✍️" title="Generate Cover Letter" desc="Tailored letters from any job URL in seconds" gradient="linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.08))" accent="#ec4899" onClick={() => router.push('/dashboard/generate')} />
          <ActionCard icon="💰" title="Salary Intelligence" desc="Benchmark your salary for any role, anywhere" accent="#ec4899" onClick={() => router.push('/dashboard/salary')} />
          <ActionCard icon="🏢" title="Dream Companies" desc="Track and get alerted when your targets hire" accent="#ec4899" onClick={() => router.push('/dashboard/companies')} />
          <ActionCard icon="📈" title="Analytics" desc="Deep insights into your job search performance" accent="#ec4899" onClick={() => router.push('/dashboard/analytics')} />
          <ActionCard icon="🔍" title="Job Discovery" desc="Search millions of jobs across all industries" accent="#a78bfa" onClick={() => router.push('/dashboard/jobs')} />
          <ActionCard icon="🤖" title="AI Career Assistant" desc="Your personal career coach, available 24/7" accent="#a78bfa" onClick={() => router.push('/dashboard/assistant')} />
        </div>
      </div>

      {/* Premium insights row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        {/* Salary widget */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '600', margin: 0 }}>Salary Intel</h3>
            <span style={{ fontSize: '18px' }}>💰</span>
          </div>
          <p style={{ color: '#64647a', fontSize: '12px', margin: '0 0 14px' }}>Search your role to see live salary benchmarks.</p>
          <button onClick={() => router.push('/dashboard/salary')} style={{ width: '100%', padding: '9px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '8px', color: '#ec4899', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Open Salary Intel →
          </button>
        </div>

        {/* Dream companies */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '600', margin: 0 }}>Dream Companies</h3>
            <span style={{ fontSize: '18px' }}>🏢</span>
          </div>
          <p style={{ color: '#64647a', fontSize: '12px', margin: '0 0 14px' }}>Track companies you want to work at. Get alerts when they hire.</p>
          <button onClick={() => router.push('/dashboard/companies')} style={{ width: '100%', padding: '9px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '8px', color: '#ec4899', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Manage Companies →
          </button>
        </div>

        {/* Analytics */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '600', margin: 0 }}>Analytics</h3>
            <span style={{ fontSize: '18px' }}>📈</span>
          </div>
          <p style={{ color: '#64647a', fontSize: '12px', margin: '0 0 14px' }}>Track your response rates, pipeline velocity and more.</p>
          <button onClick={() => router.push('/dashboard/analytics')} style={{ width: '100%', padding: '9px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '8px', color: '#ec4899', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            View Analytics →
          </button>
        </div>
      </div>

      {/* More tools row */}
      <div style={{ marginBottom: '28px', background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '20px' }}>
        <h2 style={{ color: 'white', fontSize: '15px', fontWeight: '600', margin: '0 0 14px', letterSpacing: '-0.3px' }}>All Pro Tools</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { icon: '📊', label: 'ATS Score', href: '/dashboard/ats' },
            { icon: '🎤', label: 'Interview Prep', href: '/dashboard/interview' },
            { icon: '📄', label: 'CV Builder', href: '/dashboard/cv' },
            { icon: '🎯', label: 'One-Click Apply', href: '/dashboard/apply' },
            { icon: '📧', label: 'Follow-up', href: '/dashboard/followup' },
            { icon: '📣', label: 'Outreach', href: '/dashboard/outreach' },
            { icon: '📡', label: 'Radar', href: '/dashboard/radar' },
            { icon: '📋', label: 'My Letters', href: '/dashboard/letters' },
          ].map(t => (
            <div key={t.href} onClick={() => router.push(t.href)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(236,72,153,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <span style={{ fontSize: '14px' }}>{t.icon}</span>
              <span style={{ color: '#c8c8d8', fontSize: '12px', fontWeight: '500' }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      <RecentLetters letters={recentLetters} router={router} accentColor="#ec4899" />
    </>
  )
}

function RecentLetters({ letters, router, accentColor = '#a78bfa' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: '600', margin: 0, letterSpacing: '-0.3px' }}>Recent Cover Letters</h2>
        <button onClick={() => router.push('/dashboard/letters')} style={{ background: 'none', border: 'none', color: accentColor, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' }}>View all →</button>
      </div>
      {letters.length === 0 ? (
        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>✍️</div>
          <p style={{ color: '#9898ad', fontSize: '14px', margin: '0 0 16px' }}>No cover letters yet. Generate your first one!</p>
          <button onClick={() => router.push('/dashboard/generate')} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '8px', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Generate Cover Letter
          </button>
        </div>
      ) : (
        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden' }}>
          {letters.map((letter, i) => (
            <div key={letter.id} style={{ padding: '16px 20px', borderBottom: i < letters.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', background: `${accentColor}15`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>✍️</div>
                <div>
                  <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{letter.job_title || 'Cover Letter'}</p>
                  <p style={{ color: '#64647a', fontSize: '12px', margin: 0 }}>{letter.company || 'Company'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#64647a', fontSize: '12px' }}>{new Date(letter.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                <button onClick={() => router.push('/dashboard/letters')} style={{ padding: '6px 14px', background: `${accentColor}18`, border: `1px solid ${accentColor}30`, borderRadius: '6px', color: accentColor, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' }}>View</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [letters, setLetters] = useState([])
  const [recentLetters, setRecentLetters] = useState([])
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
        setUser({ email: 'dev@localhost', id: 'dev' })
        setProfile({ plan: 'premium', first_name: 'Dev' })
        setLoading(false)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: ltrs } = await supabase.from('cover_letters').select('id, job_title, company, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      setLetters(ltrs || [])
      setRecentLetters((ltrs || []).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const plan = profile?.plan || 'standard'
  const theme = PLAN_THEME[plan] || PLAN_THEME.standard
  const firstName = profile?.first_name || user?.email?.split('@')[0] || 'there'
  const userRank = PLAN_HIERARCHY[plan] ?? 0

  const welcomeSubtitle = {
    standard: letters.length > 0 ? `${letters.length} cover letter${letters.length === 1 ? '' : 's'} generated. Upgrade to Pro to unlock more.` : 'Generate your first tailored cover letter.',
    pro: letters.length > 0 ? `${letters.length} cover letter${letters.length === 1 ? '' : 's'} generated. Explore your Pro tools below.` : 'Ready to supercharge your job search?',
    premium: letters.length > 0 ? `${letters.length} cover letter${letters.length === 1 ? '' : 's'} generated. You have full access to everything.` : 'Your full premium suite is ready. Let\'s get started.',
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', fontFamily: "'Sora', -apple-system, sans-serif" }}>

      {/* Sidebar */}
      <div style={{ width: '220px', minHeight: '100vh', background: '#08080f', borderRight: `1px solid ${theme.sideBorder}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto' }}>
        {/* Logo + plan */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: '18px', color: 'white', letterSpacing: '-0.3px' }}>
            Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
          </div>
          <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '3px 8px' }}>
            <span style={{ color: theme.color, fontSize: '11px', fontWeight: '700' }}>
              {plan === 'premium' ? '👑' : plan === 'pro' ? '⚡' : '⭐'} {theme.label} Plan
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV_ITEMS.map(item => {
            const accessible = userRank >= PLAN_HIERARCHY[item.minPlan]
            return (
              <div
                key={item.href + item.label}
                onClick={() => accessible ? router.push(item.href) : router.push('/#pricing')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 10px', borderRadius: '8px', cursor: 'pointer',
                  marginBottom: '2px', transition: 'background 0.15s',
                  opacity: accessible ? 1 : 0.4,
                }}
                onMouseEnter={e => e.currentTarget.style.background = accessible ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{accessible ? item.icon : '🔒'}</span>
                <span style={{ fontSize: '13px', color: accessible ? '#c8c8d8' : '#64647a', fontWeight: '500', flex: 1 }}>{item.label}</span>
                {item.badge && !accessible && (
                  <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: BADGE_COLORS[item.badge]?.bg, color: BADGE_COLORS[item.badge]?.color }}>
                    {item.badge}
                  </span>
                )}
              </div>
            )
          })}
        </nav>

        {/* User + sign out */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '12px', color: '#64647a', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          <button onClick={signOut} style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#9898ad', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px', minHeight: '100vh' }}>

        {/* Upgrade success banner */}
        {upgraded && (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '14px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>🎉</span>
            <div>
              <p style={{ color: '#22c55e', fontWeight: '600', fontSize: '14px', margin: 0 }}>Plan upgraded successfully!</p>
              <p style={{ color: '#9898ad', fontSize: '13px', margin: 0 }}>Your new features are ready to use below.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ color: 'white', fontSize: '26px', fontWeight: '700', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
              Welcome back, {firstName} {plan === 'premium' ? '👑' : '👋'}
            </h1>
            <p style={{ color: '#9898ad', fontSize: '14px', margin: 0 }}>
              {welcomeSubtitle[plan] || welcomeSubtitle.standard}
            </p>
          </div>
          {plan !== 'premium' && (
            <button onClick={() => router.push('/#pricing')} style={{ padding: '9px 18px', background: theme.gradient, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.color, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {plan === 'standard' ? 'Upgrade to Pro →' : 'Upgrade to Premium →'}
            </button>
          )}
        </div>

        {/* Plan-specific content */}
        {plan === 'premium' && <PremiumContent letters={letters} recentLetters={recentLetters} router={router} />}
        {plan === 'pro' && <ProContent letters={letters} recentLetters={recentLetters} router={router} />}
        {plan === 'standard' && <StandardContent letters={letters} recentLetters={recentLetters} router={router} />}
      </div>
    </div>
  )
}
