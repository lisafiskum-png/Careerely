'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Letters() {
  const [user, setUser] = useState(null)
  const [letters, setLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [copied, setCopied] = useState(null)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      await fetchLetters(user.id)
      setLoading(false)
    }
    load()
  }, [])

  async function fetchLetters(userId) {
    const { data } = await supabase
      .from('cover_letters')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setLetters(data || [])
  }

  async function deleteLetter(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this cover letter?')) return
    setDeleting(id)
    await supabase.from('cover_letters').delete().eq('id', id)
    setLetters(prev => prev.filter(l => l.id !== id))
    if (selected?.id === id) setSelected(null)
    setDeleting(null)
  }

  function copyToClipboard(e, text, id) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function downloadPDF(e, letter) {
    e.stopPropagation()

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const fullName = profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile?.first_name || ''

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // PAGE: A4 = 297mm tall. Margins 25mm top/bottom = 247mm usable.
    const margin = 25
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const maxWidth = pageWidth - margin * 2

    // Times New Roman 12pt, single-spacing
    const fontSize = 12
    const lineHeight = 5.5     // tight single spacing in mm
    const paragraphGap = 4     // gap between paragraphs
    let y = margin + 5

    doc.setFont('times', 'normal')
    doc.setFontSize(fontSize)
    doc.setTextColor(0, 0, 0)

    // Clean the body — remove anything that looks like greeting/sign-off/name
    let bodyText = letter.cover_letter.trim()
    bodyText = bodyText.replace(/^dear hiring manager[,.]?\s*/gi, '')
    bodyText = bodyText.replace(/yours sincerely[,.]?\s*/gi, '')
    bodyText = bodyText.replace(/sincerely[,.]?\s*/gi, '')
    if (fullName) {
      bodyText = bodyText.replace(new RegExp(fullName, 'gi'), '')
    }
    bodyText = bodyText.trim()

    const paragraphs = bodyText.split(/\n\n+/).map(p => p.trim()).filter(p => p !== '')

    function writeLeftLine(text) {
      doc.text(text, margin, y)
      y += lineHeight
    }

    function writeJustifiedLine(lineText, isLast) {
      if (isLast) {
        doc.text(lineText, margin, y)
      } else {
        const words = lineText.trim().split(/\s+/)
        if (words.length > 1) {
          const textWidth = doc.getTextWidth(words.join(' '))
          const totalSpacing = maxWidth - textWidth + doc.getTextWidth(' ') * (words.length - 1)
          const spaceWidth = totalSpacing / (words.length - 1)
          let x = margin
          words.forEach(word => {
            doc.text(word, x, y)
            x += doc.getTextWidth(word) + spaceWidth
          })
        } else {
          doc.text(lineText, margin, y)
        }
      }
      y += lineHeight
    }

    // 1. "Dear Hiring Manager,"
    writeLeftLine('Dear Hiring Manager,')
    y += paragraphGap

    // 2. Body — justified
    paragraphs.forEach((para, pi) => {
      const lines = doc.splitTextToSize(para, maxWidth)
      lines.forEach((line, i) => {
        writeJustifiedLine(line, i === lines.length - 1)
      })
      if (pi < paragraphs.length - 1) {
        y += paragraphGap
      }
    })

    // 3. "Sincerely," then name on next line
    y += paragraphGap
    writeLeftLine('Sincerely,')
    if (fullName) writeLeftLine(fullName)

    const filename = `${getDisplayTitle(letter).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cover_letter.pdf`
    doc.save(filename)
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  function getDisplayTitle(letter) {
    if (letter.job_title && letter.job_title !== 'Job Application' && letter.job_title !== 'Cover Letter') {
      return letter.job_title
    }
    if (letter.job_url) {
      try {
        const url = new URL(letter.job_url)
        return url.hostname.replace('www.', '')
      } catch {}
    }
    return 'Cover Letter'
  }

  const s = {
    page: { minHeight: '100vh', background: '#06060b', fontFamily: 'sans-serif' },
    nav: { padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    logo: { fontWeight: '700', fontSize: '19px', color: 'white', cursor: 'pointer' },
    logoSpan: { background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    container: { maxWidth: '960px', margin: '0 auto', padding: '48px 24px' },
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06060b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9898ad', fontFamily: 'sans-serif' }}>Loading...</p>
    </div>
  )

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.logo} onClick={() => router.push('/dashboard')}>
          Career<span style={s.logoSpan}>ely</span>
        </div>
        <span style={{ color: '#9898ad', fontSize: '13px' }}>{user?.email}</span>
      </nav>

      <div style={s.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ color: 'white', fontSize: '26px', fontWeight: '700', marginBottom: '4px' }}>Cover Letters</h1>
            <p style={{ color: '#9898ad', fontSize: '14px' }}>{letters.length} {letters.length === 1 ? 'letter' : 'letters'} generated</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/generate')}
            style={{ padding: '11px 22px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            + New Letter
          </button>
        </div>

        {letters.length === 0 ? (
          <div style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '64px 48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>✍️</div>
            <p style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No cover letters yet</p>
            <p style={{ color: '#9898ad', fontSize: '14px', marginBottom: '24px' }}>Generate your first letter by pasting a job URL.</p>
            <button
              onClick={() => router.push('/dashboard/generate')}
              style={{ padding: '12px 24px', background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Generate your first cover letter
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: '16px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {letters.map(letter => (
                <div
                  key={letter.id}
                  onClick={() => setSelected(selected?.id === letter.id ? null : letter)}
                  style={{
                    background: selected?.id === letter.id ? 'rgba(124,58,237,0.08)' : '#0c0c14',
                    border: selected?.id === letter.id ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                      <p style={{ color: '#eaeaf0', fontSize: '14px', fontWeight: '600', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getDisplayTitle(letter)}
                      </p>
                      <p style={{ color: '#64647a', fontSize: '11px', marginBottom: '8px' }}>{formatDate(letter.created_at)}</p>
                      {!selected && (
                        <p style={{ color: '#9898ad', fontSize: '12px', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {letter.cover_letter.slice(0, 120)}...
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={e => copyToClipboard(e, letter.cover_letter, letter.id)}
                        style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '6px', color: copied === letter.id ? '#22c55e' : '#a78bfa', fontSize: '11px', cursor: 'pointer' }}
                      >
                        {copied === letter.id ? '✓' : 'Copy'}
                      </button>
                      <button
                        onClick={e => downloadPDF(e, letter)}
                        style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#9898ad', fontSize: '11px', cursor: 'pointer' }}
                      >
                        PDF
                      </button>
                      <button
                        onClick={e => deleteLetter(e, letter.id)}
                        disabled={deleting === letter.id}
                        style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '6px', color: '#ef4444', fontSize: '11px', cursor: 'pointer', opacity: deleting === letter.id ? 0.5 : 1 }}
                      >
                        {deleting === letter.id ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div style={{ background: '#0c0c14', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '14px', padding: '28px', position: 'sticky', top: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <p style={{ color: 'white', fontSize: '15px', fontWeight: '600', marginBottom: '3px' }}>{getDisplayTitle(selected)}</p>
                    <p style={{ color: '#64647a', fontSize: '11px' }}>{formatDate(selected.created_at)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={e => copyToClipboard(e, selected.cover_letter, selected.id)}
                      style={{ padding: '7px 14px', background: copied === selected.id ? 'rgba(34,197,94,0.1)' : 'transparent', border: `1px solid ${copied === selected.id ? 'rgba(34,197,94,0.3)' : 'rgba(124,58,237,0.3)'}`, borderRadius: '7px', color: copied === selected.id ? '#22c55e' : '#a78bfa', fontSize: '12px', cursor: 'pointer' }}
                    >
                      {copied === selected.id ? '✓ Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={e => downloadPDF(e, selected)}
                      style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', color: '#9898ad', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Download PDF
                    </button>
                    <button onClick={() => setSelected(null)} style={{ padding: '7px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', color: '#64647a', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
                  <p style={{ color: '#eaeaf0', fontSize: '13px', lineHeight: '1.9', whiteSpace: 'pre-wrap' }}>{selected.cover_letter}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
