'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const validPlans = ['standard', 'pro', 'premium']

export default function Auth() {
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedBilling, setSelectedBilling] = useState('monthly')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const plan = params.get('plan')
    const billing = params.get('billing')
    if (validPlans.includes(plan)) setSelectedPlan(plan)
    if (billing === 'annual') setSelectedBilling('annual')
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        const userId = data.user?.id
        if (userId) {
          await supabase.from('profiles').upsert({ id: userId, email, plan: 'standard' })
        }
        if (userId && selectedPlan && selectedPlan !== 'standard') {
          try {
            const res = await fetch('/api/stripe-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plan: selectedPlan, billing: selectedBilling, userId, email }),
            })
            const json = await res.json()
            if (json.url) { window.location.href = json.url; return }
          } catch {}
        }
        router.push('/dashboard')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Sora', sans-serif; background: #06060b; }
        body::after { content: ''; position: fixed; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E"); pointer-events: none; z-index: 9999; }
        .auth-input { width: 100%; padding: 13px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: white; font-size: 14px; outline: none; font-family: 'Sora', sans-serif; transition: border-color 0.2s; }
        .auth-input:focus { border-color: rgba(124,58,237,0.4); }
        .auth-input::placeholder { color: #64647a; }
        .auth-btn { width: 100%; padding: 13px; background: linear-gradient(135deg,#ec4899,#a855f7,#7c3aed); border: none; border-radius: 10px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; transition: all 0.25s; box-shadow: 0 4px 16px rgba(124,58,237,0.2); }
        .auth-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(124,58,237,0.35); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Sora', sans-serif", padding: '24px', position: 'relative' }}>

        {/* Glow */}
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div
          onClick={() => router.push('/')}
          style={{ fontWeight: 700, fontSize: 22, color: 'white', marginBottom: 40, cursor: 'pointer', letterSpacing: '-0.3px' }}
        >
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>

        {/* Card */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '420px', position: 'relative', overflow: 'hidden' }}>
          {/* Top gradient line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', opacity: 0.4 }} />

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.3px' }}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h1>
            <p style={{ color: '#9898ad', fontSize: 14 }}>
              {isSignUp ? '7-day free trial. No credit card required.' : 'Sign in to your Careerely account.'}
            </p>
            {isSignUp && selectedPlan && (
              <p style={{ color: '#a78bfa', fontSize: 13, marginTop: 8 }}>
                You're signing up for the <strong>{selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}</strong> plan
                {selectedPlan !== 'standard' ? ` (${selectedBilling})` : ''}.
                {selectedPlan !== 'standard' ? " You'll be taken to checkout after creating your account." : ''}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ color: '#9898ad', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ color: '#9898ad', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: 6 }}>Password</label>
              <input
                className="auth-input"
                type="password"
                placeholder={isSignUp ? 'Min. 6 characters' : 'Your password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>
              </div>
            )}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />

          <p style={{ color: '#9898ad', fontSize: 13, textAlign: 'center' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span
              onClick={() => { setIsSignUp(!isSignUp); setError('') }}
              style={{ color: '#a78bfa', cursor: 'pointer', fontWeight: 600 }}
            >
              {isSignUp ? 'Sign in' : 'Sign up free'}
            </span>
          </p>
        </div>

        {isSignUp && (
          <p style={{ color: '#64647a', fontSize: 12, marginTop: 20, textAlign: 'center', maxWidth: 320 }}>
            By creating an account you agree to our{' '}
            <span style={{ color: '#9898ad', cursor: 'pointer' }}>Terms of Service</span>
            {' '}and{' '}
            <span style={{ color: '#9898ad', cursor: 'pointer' }}>Privacy Policy</span>.
          </p>
        )}
      </div>
    </>
  )
}
