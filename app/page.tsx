'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { billingOptions, pricingPlans, type BillingPeriod } from '../lib/plans'

const M  = '#c026d3'
const MG = 'linear-gradient(135deg, #7c3aed 0%, #c026d3 55%, #ec4899 100%)'

export default function Landing() {
  const router = useRouter()
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [openFaq, setOpenFaq]  = useState<number | null>(null)
  const [email, setEmail]       = useState('')

  const faqs = [
    { q: "What if I don't have a cover letter to paste?",    a: "No problem. Careerely can generate a CV from scratch using your profile information." },
    { q: "How does voice matching work?",                    a: "You paste a cover letter you have written. Our AI learns your unique tone, phrasing, and style, then applies it to every new letter." },
    { q: "Can I switch plans later?",                        a: "Yes. You can upgrade or downgrade your plan anytime. Changes take effect at your next billing cycle." },
    { q: "Is my data secure?",                               a: "Absolutely. All data is encrypted and stored securely. We never share your information with third parties." },
    { q: "How many jobs can I apply to?",                    a: "Pro and Premium plans have unlimited applications. Standard plan includes 10 cover letters per month." },
    { q: "Do you offer a free trial?",                       a: "Yes — every plan comes with a 7-day free trial. No credit card required to start." },
  ]

  const features = [
    { icon: '✨', label: 'Voice-matched letters' },
    { icon: '🔍', label: 'Job discovery' },
    { icon: '⚡', label: 'One-click apply' },
    { icon: '🎯', label: 'Interview prep' },
    { icon: '📄', label: 'CV builder' },
    { icon: '🎯', label: 'ATS optimization' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Sora', sans-serif; background: #fff; color: #111; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
      }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.4px', color: '#111' }}>
          Careerely<span style={{ color: M }}>.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          {[['Features', '#features'], ['Pricing', '#pricing'], ['FAQ', '#faq']].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: 14, fontWeight: 500, color: '#6b7280', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
            >{label}</a>
          ))}
        </div>
        <button
          onClick={() => router.push('/auth')}
          style={{ padding: '10px 22px', background: MG, border: 'none', borderRadius: 100, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif' }}
        >Join Waitlist</button>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 48px 100px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        {/* Left */}
        <div>
          <h1 style={{ fontSize: 'clamp(52px, 6vw, 80px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-3px', color: '#111', marginBottom: 24 }}>
            Your voice.<br />Every<br />application.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: '#6b7280', marginBottom: 36, maxWidth: 420 }}>
            Stop writing generic cover letters. Careerely learns how you write and tailors every application to the exact job. In under 2 minutes.
          </p>

          {/* Trust badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ display: 'flex' }}>
              {['#ec4899','#c026d3','#7c3aed'].map((c, i) => (
                <div key={c} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: '2px solid white', marginLeft: i ? -8 : 0 }} />
              ))}
            </div>
            <span style={{ fontSize: 14, color: '#374151' }}>Trusted by <strong>2,847</strong> job seekers</span>
          </div>

          {/* Email form */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              type="email"
              style={{ flex: 1, padding: '13px 18px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontFamily: 'Sora, sans-serif', outline: 'none', color: '#111', background: '#fff' }}
              onFocus={e => (e.currentTarget.style.borderColor = M)}
              onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
            />
            <button
              onClick={() => router.push(email ? `/auth?email=${encodeURIComponent(email)}` : '/auth')}
              style={{ padding: '13px 28px', background: MG, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif', whiteSpace: 'nowrap' }}
            >Join</button>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Invite only. 50 spots this week. Founding-member pricing locked in.</p>
        </div>

        {/* Right — gradient blob card */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #fce7f3 100%)', borderRadius: 24, padding: '52px 48px', boxShadow: '0 20px 60px rgba(192,38,211,0.12)', border: '1px solid rgba(192,38,211,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 380, height: 320 }}>
            <div style={{
              width: 220, height: 220, borderRadius: '50%',
              background: 'radial-gradient(circle at 38% 32%, #c084fc, #7c3aed 35%, #c026d3 58%, #ec4899 100%)',
              boxShadow: '0 24px 64px rgba(192,38,211,0.45), 0 8px 24px rgba(124,58,237,0.3)',
            }} />
          </div>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: '80px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px', color: '#111', textAlign: 'center', marginBottom: 56 }}>
          Three steps to your next role
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { n: '1', title: 'Paste your voice',  desc: 'Upload a cover letter you have written. Careerely learns your tone and voice.' },
            { n: '2', title: 'Search jobs',        desc: 'Find roles across the entire job market. Ranked by fit to your profile.' },
            { n: '3', title: 'Apply in seconds',   desc: 'One-click apply with a tailored cover letter. Every letter sounds like you.' },
          ].map(step => (
            <div key={step.n} style={{ border: '1.5px solid #e5e7eb', borderRadius: 16, padding: '36px 28px' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: MG, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{step.n}</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 10, letterSpacing: '-0.3px' }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" style={{ background: '#fff', padding: '80px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, letterSpacing: '-1.2px', color: '#111', textAlign: 'center', marginBottom: 48 }}>
          Built for professionals who don&apos;t settle
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {features.map((f, i) => (
            <div key={i} style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '28px 22px' }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{f.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" style={{ background: '#fff', padding: '80px 48px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, letterSpacing: '-1.2px', color: '#111', textAlign: 'center', marginBottom: 8 }}>
          Simple, transparent pricing
        </h2>

        {/* Billing toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 48, marginTop: 24 }}>
          <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 100, padding: 4 }}>
            {(['monthly', 'annual'] as BillingPeriod[]).map(period => (
              <button
                key={period}
                onClick={() => setBilling(period)}
                style={{
                  padding: '8px 22px', borderRadius: 100, border: 'none', cursor: 'pointer', fontFamily: 'Sora, sans-serif',
                  fontSize: 13, fontWeight: 600,
                  background: billing === period ? MG : 'transparent',
                  color: billing === period ? 'white' : '#6b7280',
                  transition: 'all 0.2s',
                }}
              >
                {billingOptions[period].label}
                {billingOptions[period].discountLabel && billing !== period && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 100, padding: '2px 8px', fontWeight: 700 }}>
                    {billingOptions[period].discountLabel}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 960, margin: '0 auto' }}>
          {pricingPlans.map(plan => {
            const price = billing === 'annual' ? plan.annual : plan.monthly
            return (
              <div
                key={plan.id}
                style={{
                  border: plan.highlight ? `2px solid ${M}` : '1.5px solid #e5e7eb',
                  borderRadius: 18, padding: '36px 28px',
                  position: 'relative', display: 'flex', flexDirection: 'column',
                  background: '#fff',
                }}
              >
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: MG, color: 'white', fontSize: 11, fontWeight: 800, padding: '5px 18px', borderRadius: 100, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    Most Popular
                  </div>
                )}
                <p style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 4 }}>{plan.title}</p>
                <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20, lineHeight: 1.4 }}>{plan.tagline}</p>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: '#111', letterSpacing: '-2px' }}>${price}</span>
                  <span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 4 }}>/month</span>
                </div>
                <button
                  onClick={() => router.push(`/auth?plan=${plan.id}&billing=${billing}`)}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    fontFamily: 'Sora, sans-serif', cursor: 'pointer', marginBottom: 24,
                    background: plan.highlight ? MG : 'transparent',
                    color: plan.highlight ? 'white' : '#111',
                    border: plan.highlight ? 'none' : '1.5px solid #d1d5db',
                    boxShadow: plan.highlight ? '0 4px 16px rgba(192,38,211,0.25)' : 'none',
                  }}
                >Get Started</button>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#374151' }}>
                      <span style={{ color: M, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" style={{ background: '#fff', padding: '80px 48px', maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, letterSpacing: '-1.2px', color: '#111', textAlign: 'center', marginBottom: 48 }}>
          Questions? We have answers.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map((faq, i) => (
            <div
              key={i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', cursor: 'pointer', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{faq.q}</p>
                <span style={{ color: '#9ca3af', fontSize: 20, flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>+</span>
              </div>
              {openFaq === i && (
                <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, marginTop: 12 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────── */}
      <div style={{ background: MG, padding: '80px 48px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 56px)', fontWeight: 900, color: 'white', letterSpacing: '-2px', marginBottom: 16 }}>
          Ready to land your next role?
        </h2>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.8)', marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
          Join thousands of job seekers who have transformed their applications.
        </p>
        <button
          onClick={() => router.push('/auth')}
          style={{ padding: '16px 40px', background: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, color: M, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
        >Join the Waitlist</button>
      </div>

      {/* ── Footer (white) ───────────────────────────────────── */}
      <footer style={{ background: '#fff', borderTop: '1px solid #e5e7eb', padding: '60px 48px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Top row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 40, marginBottom: 48 }}>
            {/* Brand */}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginBottom: 10, letterSpacing: '-0.3px' }}>
                Careerely<span style={{ color: M }}>.</span>
              </div>
              <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>Your voice. Every application.</p>
            </div>
            {/* Product */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#111', marginBottom: 14 }}>Product</p>
              {['Features', 'Pricing', 'FAQ'].map(l => (
                <a key={l} href={`#${l.toLowerCase()}`} style={{ display: 'block', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >{l}</a>
              ))}
            </div>
            {/* Company */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#111', marginBottom: 14 }}>Company</p>
              {['About', 'Blog', 'Careers'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >{l}</a>
              ))}
            </div>
            {/* Legal */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#111', marginBottom: 14 }}>Legal</p>
              {['Privacy', 'Terms', 'Contact'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >{l}</a>
              ))}
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>© 2025 Careerely. All rights reserved.</p>
            <div style={{ display: 'flex', gap: 20 }}>
              {['Twitter', 'LinkedIn', 'Instagram'].map(s => (
                <a key={s} href="#" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >{s}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
