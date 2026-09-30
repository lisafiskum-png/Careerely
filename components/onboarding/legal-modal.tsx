'use client'
import { Fragment, useEffect } from 'react'
import { PRIVACY, TERMS, type LegalDoc } from '../../lib/legal'
import s from './onboarding.module.css'

export type LegalKind = 'terms' | 'privacy'

const DOCS: Record<LegalKind, LegalDoc> = { terms: TERMS, privacy: PRIVACY }

// Renders **bold** segments without innerHTML.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}

export function LegalModal({ open, onClose }: { open: LegalKind | null; onClose: () => void }) {
  const doc = open ? DOCS[open] : null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  return (
    <div className={`${s.modalOverlay} ${open ? s.modalOpen : ''}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-labelledby="legal-title">
      <div className={s.modalBackdrop} onClick={onClose} />
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h2 id="legal-title">{doc?.title}</h2>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={s.modalBody}>
          {doc && (
            <>
              <p className={s.modalUpdated}>{doc.updated}</p>
              {doc.blocks.map((block, i) => (
                <Fragment key={i}>
                  {block.heading && <h3>{block.heading}</h3>}
                  {block.paragraphs.map((p, j) => (
                    <p key={j}>
                      <Rich text={p} />
                    </p>
                  ))}
                </Fragment>
              ))}
            </>
          )}
        </div>
        <div className={s.modalFooter}>
          <button type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
