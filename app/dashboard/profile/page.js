'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Profile() {
  const [user, setUser] = useState(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [voiceSample, setVoiceSample] = useState('')
  const [plan, setPlan] = useState('standard')
  const [radarEnabled, setDigestEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data } = await supabase.from('profiles').select('voice_sample, first_name, last_name, plan, digest_enabled').eq('id', user.id).single()
      if (data?.voice_sample) setVoiceSample(data.voice_sample)
      if (data?.first_name) setFirstName(data.first_name)
      if (data?.last_name) setLastName(data.last_name)
      if (data?.plan) setPlan(data.plan)
      setDigestEnabled(data?.digest_enabled || false)
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      voice_sample: voiceSample,
      first_name: firstName,
      last_name: lastName,
      plan,
      digest_enabled: radarEnabled,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const wordCount = voiceSample.trim() ? voiceSample.trim().split(/\s+/).length : 0

  function getQualityScore() {
    if (wordCount === 0) return null
    if (wordCount < 50) return { label: 'Too short', color: '#ef4444', tip: 'Add more — aim for at least 150 words for best results.' }
    if (wordCount < 150) return { label: 'Could be better', color: '#f59e0b', tip: 'More text gives Careerely more to learn from. Try adding another paragraph.' }
    if (wordCount < 400) return { label: 'Good', color: '#22c55e', tip: 'Good length. The more natural and personal your sample, the better your letters.' }
    return { label: 'Excellent', color: '#a78bfa', tip: 'Great sample! Careerely has plenty to work with.' }
  }

  const quality = getQualityScore()

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  const inputStyle = { width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'sans-serif', boxSizing: 'border-box' }
  const labelStyle = { color: '#9898ad', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' }}>
      <nav style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
          Career<span style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: '700', marginBottom: '8px' }}>Voice Profile</h1>
          <p style={{ color: '#9898ad', fontSize: '14px' }}>Careerely learns your writing style from this sample and uses it for every cover letter.</p>
        </div>

        {/* Name fields */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '24px 28px', marginBottom: '16px' }}>
          <p style={{ color: 'white', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>Your Name</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                style={inputStyle}
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                style={inputStyle}
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
          </div>
          <p style={{ color: '#64647a', fontSize: '12px', marginTop: '10px' }}>Used as the signature on your PDF cover letters.</p>
        </div>

        {/* Tips */}
        <div style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
          <p style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>💡 What makes a good voice sample?</p>
          {['A cover letter you wrote yourself (not AI-generated)', 'At least 150 words — more is better', 'Something recent that reflects how you write today', 'Natural, personal tone — not overly formal'].map((tip, i) => (
            <p key={i} style={{ color: '#9898ad', fontSize: '12px', marginBottom: '3px' }}>· {tip}</p>
          ))}
        </div>

        {/* Voice sample */}
        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '24px 28px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <p style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>Writing Sample</p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {quality && <span style={{ fontSize: '11px', color: quality.color, fontWeight: '600' }}>{quality.label}</span>}
              <span style={{ fontSize: '11px', color: '#64647a' }}>{wordCount} words</span>
            </div>
          </div>
          <p style={{ color: '#64647a', fontSize: '12px', marginBottom: '12px' }}>Paste a cover letter you've written. This is what Careerely learns from.</p>
          <textarea
            style={{ width: '100%', height: '280px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${quality ? quality.color + '40' : 'rgba(255,255,255,0.08)'}`, borderRadius: '10px', color: 'white', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'sans-serif', lineHeight: '1.6', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
            placeholder="Paste a cover letter you've written before..."
            value={voiceSample}
            onChange={e => setVoiceSample(e.target.value)}
          />
          {quality?.tip && <p style={{ color: '#64647a', fontSize: '12px', marginTop: '8px' }}>→ {quality.tip}</p>}
        </div>

        <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '20px 28px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'white', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Radar</p>
            <p style={{ color: '#64647a', fontSize: '12px' }}>Get a daily email with fresh job matches tailored to your profile.</p>
          </div>
          <div
            onClick={() => setDigestEnabled(v => !v)}
            style={{ width: '44px', height: '24px', borderRadius: '999px', background: radarEnabled ? 'linear-gradient(135deg,#a78bfa,#7c3aed)' : 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <div style={{ position: 'absolute', top: '3px', left: radarEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={save}
            disabled={saving || !voiceSample}
            style={{
              padding: '13px 32px',
              background: saved ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)',
              border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none',
              borderRadius: '10px',
              color: saved ? '#22c55e' : 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: saving || !voiceSample ? 'not-allowed' : 'pointer',
              opacity: saving || !voiceSample ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Profile'}
          </button>
          {saved && <span style={{ color: '#22c55e', fontSize: '13px' }}>Profile updated successfully</span>}
        </div>
      </div>
    </div>
  )
}
