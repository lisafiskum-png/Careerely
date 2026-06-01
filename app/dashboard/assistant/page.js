'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { isPlanAtLeast } from '../../../lib/plans'

export default function Assistant() {
  const [user, setUser] = useState(null)
  const [plan, setPlan] = useState('standard')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [input, setInput] = useState('')
  const [conversation, setConversation] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: profileData } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      const currentPlan = profileData?.plan || 'standard'
      const effectivePlan = process.env.NODE_ENV === 'development' ? 'pro' : currentPlan
      setPlan(effectivePlan)
      setAccessDenied(!isPlanAtLeast(effectivePlan, 'pro'))
      setLoading(false)
      setConversation([
        { role: 'assistant', message: 'How can I help you today? Ask for interview answers, messaging, or application advice.' }
      ])
    }
    load()
  }, [])

  async function sendMessage() {
    if (!input.trim()) return
    const prompt = input.trim()
    setConversation(prev => [...prev, { role: 'user', message: prompt }])
    setInput('')
    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/career-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'assistant', payload: { conversation: [...conversation, { role: 'user', message: prompt }] } })
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setConversation(prev => [...prev, { role: 'assistant', message: data.result }])
      }
    } catch (err) {
      setError('Unable to send your message. Please try again.')
    }

    setSending(false)
  }

  const quickPrompts = [
    'Help me answer: why do you want this role?',
    'Write a short salary negotiation response.',
    'What should I say in a follow-up message after an interview?',
  ]

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
          Upgrade to Pro or Premium to access this feature.
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
            <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>AI Career Assistant</h1>
            <p style={{ color: '#9898ad', fontSize: '15px', lineHeight: '1.8', maxWidth: '680px' }}>
              Get quick advice on interview answers, follow-up messages, salary requests, and recruiter outreach.
            </p>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '999px', padding: '8px 14px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#a78bfa', display: 'inline-block' }} />
            <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Pro</span>
          </div>
        </div>

        <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ maxHeight: '520px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {conversation.map((message, index) => (
                <div key={index} style={{ textAlign: message.role === 'user' ? 'right' : 'left' }}>
                  <div style={{ display: 'inline-block', background: message.role === 'user' ? 'linear-gradient(135deg,#ec4899,#a855f7)' : 'rgba(255,255,255,0.08)', color: message.role === 'user' ? 'white' : '#d6d6f0', padding: '16px', borderRadius: '18px', maxWidth: '90%' }}>
                    <div style={{ fontSize: '13px', marginBottom: '6px', opacity: 0.8 }}>{message.role === 'user' ? 'You' : 'Assistant'}</div>
                    <div style={{ fontSize: '14px', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{message.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '20px' }}>
              <h2 style={{ color: 'white', fontSize: '16px', marginBottom: '12px' }}>Quick prompts</h2>
              {quickPrompts.map(prompt => (
                <button key={prompt} onClick={() => { setInput(prompt); }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#d6d6f0', cursor: 'pointer', fontSize: '13px' }}>
                  {prompt}
                </button>
              ))}
            </div>
            <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '20px' }}>
              <h2 style={{ color: 'white', fontSize: '16px', marginBottom: '12px' }}>Need help with</h2>
              <p style={{ color: '#9898ad', fontSize: '13px', lineHeight: '1.8' }}>Ask for interview preparation, salary messaging, follow-up email drafts, recruiter outreach, or one-line role summaries.</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '16px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask something like: What should I say after my interview?"
            style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: '14px', outline: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            style={{ padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', color: 'white', fontWeight: '700', cursor: sending || !input.trim() ? 'not-allowed' : 'pointer' }}
          >
            {sending ? 'Thinking...' : 'Send'}
          </button>
        </div>

        {error && <div style={{ marginTop: '18px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
      </div>
    </div>
  )
}
