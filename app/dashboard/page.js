'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

// ─── Color palette ───────────────────────────────────────────
const C = {
  violet:  '#8b5cf6',
  indigo:  '#6366f1',
  blue:    '#3b82f6',
  cyan:    '#22d3ee',
  teal:    '#14b8a6',
  green:   '#4ade80',
  amber:   '#fbbf24',
  orange:  '#fb923c',
  pink:    '#f472b6',
  rose:    '#f43f5e',
  purple:  '#a855f7',
  lavender:'#c084fc',
}

const BG      = '#07070e'
const SIDEBAR = '#09091a'
const CARD    = '#0d0d20'
const BORDER  = 'rgba(255,255,255,0.07)'
const T1      = '#f0f0f8'
const T2      = '#8888a8'
const T3      = '#3d3d58'
const FONT    = "'Inter', -apple-system, sans-serif"

const PLANS = {
  standard: { label: 'Standard', color: C.green,  rank: 0 },
  pro:      { label: 'Pro',      color: C.violet,  rank: 1 },
  premium:  { label: 'Premium',  color: C.pink,    rank: 2 },
}

// Each feature card gets its own color
const FEAT_COLOR = {
  pen:       C.violet,
  files:     C.cyan,
  search:    C.blue,
  cursor:    C.amber,
  sparkle:   C.teal,
  filetext:  C.indigo,
  barchart:  C.orange,
  mic:       C.pink,
  mail:      C.lavender,
  megaphone: C.teal,
  dollar:    C.amber,
  building:  C.rose,
  trending:  C.purple,
  radio:     C.cyan,
  user:      C.green,
  dashboard: C.indigo,
  lock:      T3,
}

// ─── SVG Icons ───────────────────────────────────────────────
const ICONS = {
  dashboard:  'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  pen:        'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z',
  files:      ['M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75'],
  search:     'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  cursor:     'M15 15l6 6m-11-4a7 7 0 110-14 7 7 0 010 14z',
  sparkle:    'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  filetext:   'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  barchart:   'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  mic:        'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z',
  mail:       'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  megaphone:  'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46',
  dollar:     'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  building:   'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  trending:   'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  radio:      'M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z',
  user:       'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  lock:       'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  logout:     'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  plus:       'M12 4.5v15m7.5-7.5h-15',
  check:      'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  arrow:      'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
}

function Icon({ d, size = 16, color = T2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {[].concat(d).map((path, i) => <path key={i} d={path} />)}
    </svg>
  )
}

// ─── Nav ─────────────────────────────────────────────────────
const NAV = [
  { icon: 'dashboard', label: 'Dashboard',      href: '/dashboard',           minRank: 0 },
  { icon: 'pen',       label: 'Cover Letter',    href: '/dashboard/generate',  minRank: 0 },
  { icon: 'files',     label: 'My Letters',      href: '/dashboard/letters',   minRank: 0 },
  { divider: 'Pro' },
  { icon: 'search',    label: 'Job Discovery',   href: '/dashboard/jobs',      minRank: 1 },
  { icon: 'cursor',    label: 'One-Click Apply', href: '/dashboard/apply',     minRank: 1 },
  { icon: 'sparkle',   label: 'AI Assistant',    href: '/dashboard/assistant', minRank: 1 },
  { icon: 'filetext',  label: 'CV Builder',      href: '/dashboard/cv',        minRank: 1 },
  { icon: 'barchart',  label: 'ATS Score',       href: '/dashboard/ats',       minRank: 1 },
  { icon: 'mic',       label: 'Interview Prep',  href: '/dashboard/interview', minRank: 1 },
  { icon: 'mail',      label: 'Follow-up',       href: '/dashboard/followup',  minRank: 1 },
  { icon: 'megaphone', label: 'Outreach',        href: '/dashboard/outreach',  minRank: 1 },
  { icon: 'radio',     label: 'Radar',           href: '/dashboard/radar',     minRank: 1 },
  { divider: 'Premium' },
  { icon: 'dollar',    label: 'Salary Intel',    href: '/dashboard/salary',    minRank: 2 },
  { icon: 'building',  label: 'Dream Companies', href: '/dashboard/companies', minRank: 2 },
  { icon: 'trending',  label: 'Analytics',       href: '/dashboard/analytics', minRank: 2 },
  { divider: '' },
  { icon: 'user',      label: 'Profile',         href: '/dashboard/profile',   minRank: 0 },
]

// ─── Shared atoms ─────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: CARD, borderRadius: 14, padding: '22px 20px',
      border: `1px solid ${BORDER}`,
      borderTop: `2px solid ${color}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`, pointerEvents: 'none' }} />
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T3, margin: '0 0 10px' }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 800, color, margin: '0 0 4px', letterSpacing: '-1.5px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: T3, margin: 0 }}>{sub}</p>}
    </div>
  )
}

function FeatureCard({ icon, title, desc, onClick, locked, cols = 1 }) {
  const [hov, setHov] = useState(false)
  const accent = locked ? T3 : (FEAT_COLOR[icon] || C.violet)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov && !locked ? `linear-gradient(140deg, ${accent}12 0%, ${CARD} 55%)` : CARD,
        border: `1px solid ${hov && !locked ? accent + '55' : BORDER}`,
        borderRadius: 14, padding: '22px', cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.4 : 1,
        transition: 'border-color 0.18s, background 0.18s',
        position: 'relative',
        gridColumn: cols > 1 ? `span ${cols}` : undefined,
      }}
    >
      {locked && (
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <Icon d={ICONS.lock} size={12} color={T3} />
        </div>
      )}
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: locked ? 'rgba(255,255,255,0.04)' : `${accent}22`,
        border: `1px solid ${locked ? 'transparent' : accent + '35'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        transition: 'background 0.18s',
      }}>
        <Icon d={ICONS[locked ? 'lock' : icon]} size={18} color={locked ? T3 : accent} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: locked ? T3 : T1, margin: '0 0 5px' }}>{title}</p>
      <p style={{ fontSize: 12, color: T3, margin: 0, lineHeight: 1.6 }}>{desc}</p>
      {!locked && hov && (
        <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <Icon d={ICONS.arrow} size={13} color={accent} />
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T3, margin: '0 0 12px' }}>{children}</p>
}

function LetterRow({ letter, i, total, accent, onView }) {
  const [hov, setHov] = useState(false)
  const date = new Date(letter.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < total - 1 ? `1px solid ${BORDER}` : 'none', background: hov ? 'rgba(255,255,255,0.025)' : 'transparent', transition: 'background 0.12s' }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${accent}1a`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon d={ICONS.pen} size={14} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T1, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{letter.job_title || 'Cover Letter'}</p>
        <p style={{ fontSize: 12, color: T3, margin: 0 }}>{letter.company || '—'}</p>
      </div>
      <span style={{ fontSize: 12, color: T3, flexShrink: 0 }}>{date}</span>
      <button
        onClick={onView}
        style={{ padding: '5px 14px', background: `${accent}18`, border: `1px solid ${accent}30`, borderRadius: 6, color: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}
      >View</button>
    </div>
  )
}

function LettersPanel({ letters, accent, router }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionLabel>Recent Letters</SectionLabel>
        <button onClick={() => router.push('/dashboard/letters')} style={{ background: 'none', border: 'none', color: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>View all →</button>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
        {letters.length === 0 ? (
          <div style={{ padding: '52px 24px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `${accent}18`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon d={ICONS.pen} size={22} color={accent} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: T2, margin: '0 0 6px' }}>No letters yet</p>
            <p style={{ fontSize: 13, color: T3, margin: '0 0 20px' }}>Generate your first tailored cover letter</p>
            <button onClick={() => router.push('/dashboard/generate')} style={{ padding: '10px 22px', background: accent, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              Generate Cover Letter
            </button>
          </div>
        ) : (
          letters.map((l, i) => <LetterRow key={l.id} letter={l} i={i} total={letters.length} accent={accent} onView={() => router.push('/dashboard/letters')} />)
        )}
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar({ user, plan, router, onSignOut }) {
  const theme = PLANS[plan] || PLANS.standard
  const rank  = theme.rank
  const [hov, setHov] = useState(null)

  return (
    <div style={{
      width: 240, minHeight: '100vh',
      background: SIDEBAR,
      borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto',
    }}>
      {/* Colored left accent strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${theme.color}00, ${theme.color} 30%, ${theme.color} 70%, ${theme.color}00)`, borderRadius: '0 2px 2px 0' }} />

      {/* Logo + plan */}
      <div style={{ padding: '22px 20px 18px 22px', borderBottom: `1px solid ${BORDER}` }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: T1, letterSpacing: '-0.5px', margin: '0 0 10px' }}>
          Career<span style={{ background: 'linear-gradient(135deg,#f472b6,#a855f7,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${theme.color}18`, border: `1px solid ${theme.color}38`, borderRadius: 7, padding: '4px 10px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.color, boxShadow: `0 0 6px ${theme.color}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.color, letterSpacing: '0.03em' }}>{theme.label} Plan</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px 12px 12px' }}>
        {NAV.map((item, idx) => {
          if ('divider' in item) {
            return item.divider
              ? <p key={idx} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T3, margin: '14px 8px 6px', padding: 0 }}>{item.divider}</p>
              : <div key={idx} style={{ height: 1, background: BORDER, margin: '10px 0' }} />
          }
          const ok    = rank >= item.minRank
          const ic    = ok ? item.icon : 'lock'
          const color = ok ? (FEAT_COLOR[item.icon] || T2) : T3
          const isHov = hov === idx
          return (
            <div
              key={idx}
              onMouseEnter={() => setHov(idx)}
              onMouseLeave={() => setHov(null)}
              onClick={() => ok ? router.push(item.href) : router.push('/#pricing')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 1,
                background: isHov && ok ? `${color}12` : 'transparent',
                opacity: ok ? 1 : 0.35,
                transition: 'background 0.12s, opacity 0.12s',
              }}
            >
              <Icon d={ICONS[ic]} size={15} color={isHov && ok ? color : T2} />
              <span style={{ fontSize: 13, fontWeight: 500, color: isHov && ok ? T1 : T2, flex: 1, transition: 'color 0.12s' }}>{item.label}</span>
              {ok && isHov && <Icon d={ICONS.arrow} size={11} color={color} />}
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${BORDER}` }}>
        <p style={{ fontSize: 12, color: T3, margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
        <button
          onClick={onSignOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 9, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: T2, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = T1 }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = T2 }}
        >
          <Icon d={ICONS.logout} size={13} color={T2} />
          Sign out
        </button>
      </div>
    </div>
  )
}

// ─── Plan content ─────────────────────────────────────────────
function StandardMain({ letters, recent, router }) {
  const week = letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 604800000)).length
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        <StatCard label="Letters generated" value={letters.length} sub="All time" color={C.violet} />
        <StatCard label="This week" value={week} sub={week ? 'Active week' : 'Start applying!'} color={C.cyan} />
        <StatCard label="Your plan" value="Standard" sub="Upgrade to unlock more" color={C.green} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Your tools</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <FeatureCard icon="pen"   title="Generate Cover Letter" desc="Paste a job URL and get a tailored letter instantly." onClick={() => router.push('/dashboard/generate')} />
          <FeatureCard icon="files" title="My Letters"            desc="Browse, copy and manage all your letters."            onClick={() => router.push('/dashboard/letters')} />
          <FeatureCard icon="user"  title="Profile"               desc="Update your experience and job preferences."          onClick={() => router.push('/dashboard/profile')} />
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Unlock with Pro</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <FeatureCard icon="search"   title="Job Discovery"       desc="Search millions of live jobs worldwide."              locked onClick={() => router.push('/#pricing')} />
          <FeatureCard icon="sparkle"  title="AI Career Assistant" desc="Personal career coach available 24/7."               locked onClick={() => router.push('/#pricing')} />
          <FeatureCard icon="barchart" title="ATS Score"           desc="See how your CV ranks against any job spec."         locked onClick={() => router.push('/#pricing')} />
        </div>
      </div>

      <LettersPanel letters={recent} accent={C.violet} router={router} />

      <div style={{ marginTop: 28, background: `linear-gradient(135deg, ${C.violet}18 0%, ${C.pink}0d 100%)`, border: `1px solid ${C.violet}30`, borderRadius: 16, padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: T1, margin: '0 0 6px' }}>Unlock the full Careerely suite</p>
            <p style={{ fontSize: 13, color: T2, margin: '0 0 14px' }}>Job discovery · AI assistant · Interview prep · ATS score · CV builder · One-click apply</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['Job Discovery', C.blue], ['AI Assistant', C.teal], ['Interview Prep', C.pink], ['ATS Score', C.orange]].map(([f, col]) => (
                <span key={f} style={{ fontSize: 11, fontWeight: 600, color: col, background: `${col}18`, border: `1px solid ${col}30`, borderRadius: 6, padding: '3px 10px' }}>{f}</span>
              ))}
            </div>
          </div>
          <button onClick={() => router.push('/#pricing')} style={{ padding: '13px 28px', background: `linear-gradient(135deg, ${C.violet}, ${C.purple})`, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', boxShadow: `0 4px 20px ${C.violet}40` }}>
            Upgrade to Pro →
          </button>
        </div>
      </div>
    </>
  )
}

function ProMain({ letters, recent, router }) {
  const week = letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 604800000)).length
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        <StatCard label="Letters generated" value={letters.length} sub="All time" color={C.violet} />
        <StatCard label="This week" value={week} sub={week ? 'On a roll' : 'Start applying'} color={C.cyan} />
        <StatCard label="Your plan" value="Pro" sub="All tools unlocked" color={C.violet} />
        <StatCard label="Status" value="Active" sub="Subscription live" color={C.green} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Quick actions</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <FeatureCard icon="pen"      title="Generate Cover Letter" desc="Paste any job URL for a tailored letter in seconds." onClick={() => router.push('/dashboard/generate')} />
          <FeatureCard icon="search"   title="Job Discovery"         desc="Search live jobs across all industries worldwide."   onClick={() => router.push('/dashboard/jobs')} />
          <FeatureCard icon="sparkle"  title="AI Career Assistant"   desc="Your personal career coach, available 24/7."        onClick={() => router.push('/dashboard/assistant')} />
          <FeatureCard icon="barchart" title="ATS Score"             desc="See how your CV scores against any job spec."       onClick={() => router.push('/dashboard/ats')} />
          <FeatureCard icon="mic"      title="Interview Prep"        desc="Tailored questions with model answers."             onClick={() => router.push('/dashboard/interview')} />
          <FeatureCard icon="filetext" title="CV Builder"            desc="Build a clean, recruiter-ready CV in minutes."      onClick={() => router.push('/dashboard/cv')} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T1, margin: '0 0 16px' }}>Application Pipeline</p>
          {[['Saved', 0, C.blue], ['Applied', 0, C.violet], ['Interview', 0, C.amber], ['Offer', 0, C.green]].map(([stage, n, col]) => (
            <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 9, marginBottom: 6, borderLeft: `3px solid ${n > 0 ? col : T3}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n > 0 ? col : T3 }} />
                <span style={{ fontSize: 13, color: T2 }}>{stage}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: n > 0 ? col : T3 }}>{n}</span>
            </div>
          ))}
          <button onClick={() => router.push('/dashboard/jobs')} style={{ marginTop: 10, width: '100%', padding: 9, background: `${C.blue}18`, border: `1px solid ${C.blue}30`, borderRadius: 8, color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            Find Jobs →
          </button>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T1, margin: '0 0 16px' }}>More Tools</p>
          {[
            { icon: 'cursor',    label: 'One-Click Apply',  href: '/dashboard/apply' },
            { icon: 'mail',      label: 'Follow-up Emails', href: '/dashboard/followup' },
            { icon: 'megaphone', label: 'Cold Outreach',    href: '/dashboard/outreach' },
            { icon: 'radio',     label: 'Job Radar',        href: '/dashboard/radar' },
            { icon: 'files',     label: 'My Letters',       href: '/dashboard/letters' },
          ].map(t => <MiniRow key={t.href} icon={t.icon} label={t.label} onClick={() => router.push(t.href)} />)}
        </div>
      </div>

      <LettersPanel letters={recent} accent={C.violet} router={router} />

      <div style={{ marginTop: 28, background: `linear-gradient(135deg, ${C.pink}14, ${C.purple}0a)`, border: `1px solid ${C.pink}25`, borderRadius: 14, padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: T1, margin: '0 0 4px' }}>Go further with Premium</p>
          <p style={{ fontSize: 12, color: T2, margin: 0 }}>Salary benchmarks · Dream company tracking · Advanced analytics</p>
        </div>
        <button onClick={() => router.push('/#pricing')} style={{ padding: '10px 22px', background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', boxShadow: `0 4px 16px ${C.pink}35` }}>
          Upgrade to Premium →
        </button>
      </div>
    </>
  )
}

function PremiumMain({ letters, recent, router }) {
  const week = letters.filter(l => new Date(l.created_at) > new Date(Date.now() - 604800000)).length
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        <StatCard label="Letters generated" value={letters.length} sub="All time" color={C.pink} />
        <StatCard label="This week" value={week} sub={week ? "You're on fire" : 'Start applying'} color={C.purple} />
        <StatCard label="Your plan" value="Premium" sub="Every feature unlocked" color={C.pink} />
        <StatCard label="Status" value="Active" sub="Subscription live" color={C.green} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Premium exclusives</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <FeatureCard icon="dollar"   title="Salary Intelligence"  desc="Live benchmarks for any role and location."           onClick={() => router.push('/dashboard/salary')} />
          <FeatureCard icon="building" title="Dream Companies"      desc="Track targets, get alerts when they hire."            onClick={() => router.push('/dashboard/companies')} />
          <FeatureCard icon="trending" title="Analytics"            desc="Pipeline velocity, response rates and more."          onClick={() => router.push('/dashboard/analytics')} />
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Core tools</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <FeatureCard icon="pen"      title="Generate Cover Letter" desc="Paste any job URL for a tailored letter."             onClick={() => router.push('/dashboard/generate')} />
          <FeatureCard icon="search"   title="Job Discovery"         desc="Search live jobs across all industries."              onClick={() => router.push('/dashboard/jobs')} />
          <FeatureCard icon="sparkle"  title="AI Career Assistant"   desc="Your personal coach, available 24/7."                onClick={() => router.push('/dashboard/assistant')} />
          <FeatureCard icon="barchart" title="ATS Score"             desc="Score your CV against any job description."          onClick={() => router.push('/dashboard/ats')} />
          <FeatureCard icon="mic"      title="Interview Prep"        desc="Tailored questions with model answers."              onClick={() => router.push('/dashboard/interview')} />
          <FeatureCard icon="filetext" title="CV Builder"            desc="Build a recruiter-ready CV in minutes."              onClick={() => router.push('/dashboard/cv')} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        <div style={{ background: CARD, border: `1px solid ${C.pink}22`, borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T1, margin: '0 0 16px' }}>Application Pipeline</p>
          {[['Saved', 0, C.blue], ['Applied', 0, C.violet], ['Interview', 0, C.amber], ['Offer', 0, C.green]].map(([stage, n, col]) => (
            <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 9, marginBottom: 6, borderLeft: `3px solid ${n > 0 ? col : T3}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n > 0 ? col : T3 }} />
                <span style={{ fontSize: 13, color: T2 }}>{stage}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: n > 0 ? col : T3 }}>{n}</span>
            </div>
          ))}
        </div>
        <div style={{ background: CARD, border: `1px solid ${C.pink}22`, borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T1, margin: '0 0 16px' }}>More Tools</p>
          {[
            { icon: 'cursor',    label: 'One-Click Apply',  href: '/dashboard/apply' },
            { icon: 'mail',      label: 'Follow-up Emails', href: '/dashboard/followup' },
            { icon: 'megaphone', label: 'Cold Outreach',    href: '/dashboard/outreach' },
            { icon: 'radio',     label: 'Job Radar',        href: '/dashboard/radar' },
            { icon: 'files',     label: 'My Letters',       href: '/dashboard/letters' },
          ].map(t => <MiniRow key={t.href} icon={t.icon} label={t.label} onClick={() => router.push(t.href)} />)}
        </div>
      </div>

      <LettersPanel letters={recent} accent={C.pink} router={router} />
    </>
  )
}

function MiniRow({ icon, label, onClick }) {
  const [hov, setHov] = useState(false)
  const color = FEAT_COLOR[icon] || T2
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: hov ? `${color}0f` : 'rgba(255,255,255,0.02)', borderRadius: 9, cursor: 'pointer', transition: 'background 0.12s', marginBottom: 4 }}
    >
      <Icon d={ICONS[icon]} size={14} color={hov ? color : T2} />
      <span style={{ fontSize: 13, color: hov ? T1 : T2, fontWeight: 500, flex: 1 }}>{label}</span>
      <Icon d={ICONS.arrow} size={11} color={hov ? color : T3} />
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────
export default function Dashboard() {
  const [user, setUser]     = useState(null)
  const [profile, setProfile] = useState(null)
  const [letters, setLetters] = useState([])
  const [recent, setRecent]   = useState([])
  const [loading, setLoading] = useState(true)
  const [upgraded, setUpgraded] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search)
      if (p.get('upgraded') === 'true') { setUpgraded(true); window.history.replaceState({}, '', '/dashboard') }
    }
    async function load() {
      if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
        setUser({ email: 'dev@careerely.ai', id: 'dev' })
        setProfile({ plan: 'pro', first_name: 'Lisa' })
        setLoading(false)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: prof }  = await supabase.from('profiles').select('*').eq('id', user.id).single()
      const { data: ltrs }  = await supabase.from('cover_letters').select('id,job_title,company,created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      setProfile(prof)
      setLetters(ltrs || [])
      setRecent((ltrs || []).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() { await supabase.auth.signOut(); router.push('/auth') }

  const plan  = profile?.plan || 'standard'
  const theme = PLANS[plan] || PLANS.standard
  const name  = profile?.first_name || user?.email?.split('@')[0] || 'there'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: T1, marginBottom: 8 }}>
          Career<span style={{ background: 'linear-gradient(135deg,#f472b6,#a855f7,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </p>
        <p style={{ color: T3, fontSize: 13 }}>Loading your dashboard…</p>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${FONT}; background: ${BG}; color: ${T1}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: FONT }}>
        <Sidebar user={user} plan={plan} router={router} onSignOut={signOut} />

        <main style={{ marginLeft: 240, flex: 1, padding: '36px 40px', minHeight: '100vh', position: 'relative' }}>
          {/* Ambient glow behind header */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: 500, height: 300, background: `radial-gradient(ellipse at top right, ${theme.color}10 0%, transparent 65%)`, pointerEvents: 'none' }} />

          {/* Upgrade banner */}
          {upgraded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: `${C.green}0f`, border: `1px solid ${C.green}28`, borderRadius: 12, padding: '12px 18px', marginBottom: 28 }}>
              <Icon d={ICONS.check} size={18} color={C.green} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Plan upgraded!</p>
                <p style={{ fontSize: 12, color: T2, marginTop: 2 }}>Your new features are live below.</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 800, color: T1, letterSpacing: '-0.6px', marginBottom: 5 }}>
                {plan === 'premium' ? `Hey ${name} 👑` : `Hey ${name}`}
              </p>
              <p style={{ fontSize: 13, color: T2 }}>
                {plan === 'standard' && "You're on Standard. Upgrade to unlock the full toolkit."}
                {plan === 'pro'      && "You're on Pro — all your tools are unlocked and ready."}
                {plan === 'premium'  && "You're on Premium. Every feature is yours to use."}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/generate')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: `linear-gradient(135deg, ${C.violet}, ${C.purple})`, border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', boxShadow: `0 4px 18px ${C.violet}45` }}
            >
              <Icon d={ICONS.plus} size={14} color="white" />
              New Letter
            </button>
          </div>

          {plan === 'standard' && <StandardMain letters={letters} recent={recent} router={router} />}
          {plan === 'pro'      && <ProMain      letters={letters} recent={recent} router={router} />}
          {plan === 'premium'  && <PremiumMain  letters={letters} recent={recent} router={router} />}
        </main>
      </div>
    </>
  )
}
