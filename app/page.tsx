'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pricingPlans } from '../lib/plans'

const PUR  = '#7c3aed'
const BLK  = '#111111'
const MID  = '#374151'
const GR   = '#9ca3af'
const BDR  = '#e5e7eb'
const BG   = '#f9fafb'
const WH   = '#ffffff'
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"

export default function Landing() {
  const router = useRouter()
  const [heroEmail, setHeroEmail]   = useState('')
  const [ctaEmail,  setCtaEmail]    = useState('')

  const features = [
    { title: 'Job Discovery',    desc: 'Scrapes the entire web for roles matching your profile. No more manual searching across 10 different boards.' },
    { title: 'Voice Matching',   desc: 'Paste one cover letter. Every new application sounds exactly like you wrote it yourself.' },
    { title: 'One-Click Apply',  desc: 'Found a role? Apply in one click with a tailored cover letter. Under 2 minutes.' },
    { title: 'ATS Optimization', desc: 'Every letter is optimized for applicant tracking systems. Keywords, format, tone — all handled.' },
    { title: 'CV Builder',       desc: 'Build a CV from scratch or optimize your existing one. Tailored to each role automatically.' },
    { title: 'Interview Prep',   desc: 'AI-generated interview questions based on the exact job description. Practice before you walk in.' },
  ]

  const steps = [
    { n: '01', title: 'Paste your voice',    desc: 'Upload a cover letter you have written before. Careerely learns your tone, phrasing, and personality in seconds.' },
    { n: '02', title: 'We find the jobs',    desc: 'Our scraper searches the entire job market for roles that match your profile. Ranked by fit score.' },
    { n: '03', title: 'Apply automatically', desc: 'One click. Tailored cover letter in your voice. Sent. Done. Move on to the next one.' },
  ]

  const comparison = [
    { feature: 'Finds jobs for you',   own: '—',      gpt: '—',       us: '✓' },
    { feature: 'Sounds like you',      own: '✓',      gpt: '—',       us: '✓', ownWeak: true },
    { feature: 'Tailored per job',     own: 'Slow',   gpt: 'Generic', us: '✓' },
    { feature: 'One-click apply',      own: '—',      gpt: '—',       us: '✓' },
    { feature: 'ATS optimized',        own: '—',      gpt: '—',       us: '✓' },
    { feature: 'Time per application', own: '45 min', gpt: '15 min',  us: '2 min', isTime: true },
  ]

  const faqs = [
    { q: 'How does voice matching work?',          a: 'You paste a cover letter you have written before. Our AI learns your unique tone, phrasing, and style, then applies it to every new letter. Hiring managers cannot tell the difference.' },
    { q: 'What does the job scraper actually do?', a: 'It searches the entire internet for job postings that match your profile, experience, and preferences. Not just one board — everywhere. Results are ranked by how well they fit you.' },
    { q: 'Can I switch plans later?',              a: 'Yes. Upgrade or downgrade anytime. Changes take effect at your next billing cycle.' },
    { q: 'Is my data secure?',                     a: 'All data is encrypted at rest and in transit. We never share your information with third parties or use it to train models.' },
    { q: 'Can I cancel anytime?',                  a: 'Yes. No contracts, no commitments. Cancel from your dashboard and keep access until the end of your billing period.' },
  ]

  const SectionLabel = ({ children }: { children: string }) => (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: GR, marginBottom: 20 }}>{children}</p>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: ${FONT}; background: ${BG}; color: ${BLK}; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
        a { color: inherit; text-decoration: none; }
        .hero-input::placeholder { color: ${GR}; }
        .cta-input::placeholder { color: #4b5563; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: WH, borderBottom: `1px solid ${BDR}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 64px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px', color: BLK }}>
            Career<span style={{ color: PUR }}>ely</span>
          </div>
          <div style={{ display: 'flex', gap: 40 }}>
            {[['How it works', '#how'], ['Features', '#features'], ['Pricing', '#pricing']].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 14, fontWeight: 500, color: GR, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = BLK)}
                onMouseLeave={e => (e.currentTarget.style.color = GR)}
              >{label}</a>
            ))}
          </div>
          <button onClick={() => router.push('/auth')} style={{ padding: '9px 22px', background: BLK, color: WH, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ background: WH }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '88px 64px 52px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: GR, marginBottom: 28 }}>INVITE ONLY</p>
          <h1 style={{ fontSize: 'clamp(52px, 7vw, 92px)', fontWeight: 900, letterSpacing: '-3.5px', lineHeight: 1.03, color: BLK, marginBottom: 28, maxWidth: 820 }}>
            Stop writing applications.<br />
            <span style={{ color: PUR }}>Start landing jobs.</span>
          </h1>
          <p style={{ fontSize: 17, color: MID, lineHeight: 1.65, marginBottom: 36, maxWidth: 500 }}>
            Careerely learns your voice from one cover letter, scrapes the entire job market, and applies for you. In under 2 minutes.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input
              className="hero-input"
              type="email"
              placeholder="your@email.com"
              value={heroEmail}
              onChange={e => setHeroEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && router.push('/auth')}
              style={{ padding: '13px 18px', border: `1px solid ${BDR}`, borderRadius: 8, fontSize: 15, color: BLK, fontFamily: FONT, outline: 'none', width: 300, background: WH }}
            />
            <button
              onClick={() => router.push('/auth')}
              style={{ padding: '13px 24px', background: BLK, color: WH, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}
            >Join Waitlist</button>
          </div>
          <p style={{ fontSize: 13, color: GR }}>50 spots this week. Founding-member pricing locked in.</p>
        </div>

        {/* Stats */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 64px' }}>
          <div style={{ borderTop: `1px solid ${BDR}`, paddingTop: 40, paddingBottom: 88, display: 'flex', gap: 64 }}>
            {[
              { n: '2,847',  label: 'On the waitlist' },
              { n: '94%',    label: 'Interview rate' },
              { n: '<2 min', label: 'Per application' },
              { n: '10x',    label: 'Faster than manual' },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: 34, fontWeight: 900, color: BLK, letterSpacing: '-1px', marginBottom: 4 }}>{s.n}</p>
                <p style={{ fontSize: 14, color: GR }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ── */}
      <div id="how" style={{ background: WH, padding: '80px 64px 100px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <SectionLabel>HOW IT WORKS</SectionLabel>
          <h2 style={{ fontSize: 'clamp(40px, 6vw, 76px)', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.03, color: BLK, marginBottom: 72 }}>
            Three steps to your<br />next role.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                paddingLeft:  i > 0 ? 52 : 0,
                paddingRight: i < 2 ? 52 : 0,
                borderLeft:   i > 0 ? `1px solid ${BDR}` : 'none',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: PUR, marginBottom: 20, letterSpacing: '0.02em' }}>{step.n}</p>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: BLK, marginBottom: 12, letterSpacing: '-0.3px' }}>{step.title}</h3>
                <p style={{ fontSize: 15, color: GR, lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div id="features" style={{ background: WH, padding: '0 64px 100px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <SectionLabel>FEATURES</SectionLabel>
          <h2 style={{ fontSize: 'clamp(40px, 5.5vw, 72px)', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.03, color: BLK, marginBottom: 64 }}>
            Everything you need.<br />Nothing you don&apos;t.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${BDR}` }}>
            {features.map((f, i) => (
              <div key={i} style={{
                padding: '48px 44px',
                borderRight:  i % 2 === 0 ? `1px solid ${BDR}` : 'none',
                borderBottom: i < 4        ? `1px solid ${BDR}` : 'none',
                background: WH,
              }}>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: BLK, marginBottom: 12, letterSpacing: '-0.3px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: GR, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Comparison ── */}
      <div style={{ background: WH, padding: '0 64px 100px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <SectionLabel>WHY CAREERELY</SectionLabel>
          <h2 style={{ fontSize: 'clamp(40px, 5.5vw, 72px)', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.03, color: BLK, marginBottom: 64 }}>
            The difference is obvious.
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BDR}` }}>
                <th style={{ textAlign: 'left', padding: '14px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GR, width: '40%' }}>FEATURE</th>
                <th style={{ textAlign: 'left', padding: '14px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GR, width: '20%' }}>ON YOUR OWN</th>
                <th style={{ textAlign: 'left', padding: '14px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GR, width: '20%' }}>CHATGPT</th>
                <th style={{ textAlign: 'left', padding: '14px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: PUR, width: '20%' }}>CAREERELY</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${BDR}` }}>
                  <td style={{ padding: '20px 0', fontSize: 15, color: BLK, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ padding: '20px 0', fontSize: 15, color: row.ownWeak ? '#d1d5db' : GR }}>{row.own}</td>
                  <td style={{ padding: '20px 0', fontSize: 15, color: GR }}>{row.gpt}</td>
                  <td style={{ padding: '20px 0', fontSize: row.isTime ? 15 : 17, color: BLK, fontWeight: row.isTime ? 700 : 600 }}>{row.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pricing ── */}
      <div id="pricing" style={{ background: BG, padding: '100px 64px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <SectionLabel>PRICING</SectionLabel>
          <h2 style={{ fontSize: 'clamp(40px, 5.5vw, 72px)', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.03, color: BLK, marginBottom: 64 }}>
            Simple pricing. No<br />surprises.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'start' }}>
            {pricingPlans.map(plan => {
              const pro = !!plan.highlight
              return (
                <div key={plan.id} style={{
                  background: pro ? BLK : WH,
                  border: `1px solid ${pro ? 'transparent' : BDR}`,
                  borderRadius: 12, padding: '36px 32px',
                  marginTop: pro ? -20 : 0,
                }}>
                  {pro && (
                    <div style={{ marginBottom: 22 }}>
                      <span style={{ background: PUR, color: WH, fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 100, letterSpacing: '0.04em' }}>Most Popular</span>
                    </div>
                  )}
                  <p style={{ fontSize: 18, fontWeight: 700, color: pro ? WH : BLK, marginBottom: 4 }}>{plan.title}</p>
                  <p style={{ fontSize: 13, color: pro ? '#6b7280' : GR, marginBottom: 24, lineHeight: 1.45 }}>{plan.tagline}</p>
                  <div style={{ marginBottom: 28 }}>
                    <span style={{ fontSize: 52, fontWeight: 900, color: pro ? WH : BLK, letterSpacing: '-2px' }}>${plan.monthly}</span>
                    <span style={{ fontSize: 14, color: pro ? '#6b7280' : GR, marginLeft: 4 }}>/mo</span>
                  </div>
                  <button
                    onClick={() => router.push(`/auth?plan=${plan.id}&billing=monthly`)}
                    style={{ width: '100%', padding: '14px', borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', marginBottom: 28, background: pro ? WH : BLK, color: pro ? BLK : WH, border: 'none' }}
                  >Get Started</button>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 13, color: pro ? '#9ca3af' : MID }}>
                        <span style={{ color: pro ? '#a78bfa' : PUR, fontWeight: 700, flexShrink: 0, fontSize: 12, marginTop: 1 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div style={{ background: WH, padding: '100px 64px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <SectionLabel>FAQ</SectionLabel>
          <h2 style={{ fontSize: 'clamp(44px, 5.5vw, 72px)', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.0, color: BLK, marginBottom: 64 }}>
            Questions.
          </h2>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderTop: `1px solid ${BDR}`, padding: '28px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: BLK, marginBottom: 10, letterSpacing: '-0.2px' }}>{faq.q}</p>
              <p style={{ fontSize: 15, color: GR, lineHeight: 1.7 }}>{faq.a}</p>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BDR}` }} />
        </div>
      </div>

      {/* ── CTA (dark) ── */}
      <div style={{ background: BLK, padding: '120px 64px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(40px, 5.5vw, 64px)', fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1.05, color: WH, marginBottom: 20 }}>
            Your next role is one click away.
          </h2>
          <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 36, lineHeight: 1.6 }}>
            Join the waitlist. Get early access. Lock in founding-member pricing.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <input
              className="cta-input"
              type="email"
              placeholder="your@email.com"
              value={ctaEmail}
              onChange={e => setCtaEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && router.push('/auth')}
              style={{ padding: '13px 18px', border: '1px solid #374151', borderRadius: 8, fontSize: 15, color: WH, fontFamily: FONT, outline: 'none', width: 260, background: 'transparent' }}
            />
            <button
              onClick={() => router.push('/auth')}
              style={{ padding: '13px 24px', background: WH, color: BLK, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}
            >Join Waitlist</button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: WH, borderTop: `1px solid ${BDR}`, padding: '22px 64px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLK, letterSpacing: '-0.3px' }}>
            Career<span style={{ color: PUR }}>ely</span>
          </div>
          <div style={{ display: 'flex', gap: 32 }}>
            {['Twitter', 'LinkedIn', 'Instagram'].map(s => (
              <a key={s} href="#" style={{ fontSize: 14, color: GR, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = BLK)}
                onMouseLeave={e => (e.currentTarget.style.color = GR)}
              >{s}</a>
            ))}
          </div>
          <p style={{ fontSize: 13, color: GR }}>© 2025 Careerely</p>
        </div>
      </footer>
    </>
  )
}
