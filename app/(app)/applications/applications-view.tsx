'use client'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { AppOutcome, AppStage, ApplicationItem, ApplicationsData } from '../../../lib/applications'
import { logoTile } from '../../../lib/display'
import { LogoTile } from '../_components/logo-tile'
import { OpportunityPanel } from '../_components/opportunity-panel'

// Layout from design/applications-wip.html (reference); visual language and
// patterns from the locked dashboard. Marking Applied only happens through
// "Did you apply? → Yes, I applied" in the panel; opening the posting never
// changes the status.

const STATUS_LABEL: Record<string, string> = { applied: 'Applied', interview: 'Interview', offer: 'Offer', declined: 'Declined', withdrawn: 'Withdrawn' }
const STAGES: AppStage[] = ['applied', 'interview', 'offer']
const OUTCOMES: AppOutcome[] = ['declined', 'withdrawn']

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function Meta({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="meta-sep">·</span>}
          {p}
        </span>
      ))}
    </>
  )
}

function StatusMenu({ app, onChoose, onClose }: { app: ApplicationItem; onChoose: (change: { status: AppStage } | { outcome: AppOutcome }) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('click', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  const current = app.outcome ?? app.status
  return (
    <div className="status-menu" role="menu" ref={ref} onClick={e => e.stopPropagation()}>
      {STAGES.map(s => (
        <button key={s} role="menuitemradio" aria-checked={current === s} className="sd-item" onClick={() => onChoose({ status: s })}>
          <span className={`sd-dot sd-${s}`} />
          {STATUS_LABEL[s]}
        </button>
      ))}
      <div className="sd-sep" />
      {OUTCOMES.map(o => (
        <button key={o} role="menuitemradio" aria-checked={current === o} className="sd-item closed" onClick={() => onChoose({ outcome: o })}>
          <span className="sd-dot sd-closed" />
          {STATUS_LABEL[o]}
        </button>
      ))}
    </div>
  )
}

export function ApplicationsView({ data, readOnly }: { data: ApplicationsData; readOnly: boolean }) {
  const router = useRouter()
  const [shown, setShown] = useState(false)
  const [panel, setPanel] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [])

  const closePanel = useCallback(() => setPanel(null), [])
  const closeMenu = useCallback(() => setMenuFor(null), [])

  async function changeStatus(app: ApplicationItem, change: { status: AppStage } | { outcome: AppOutcome }) {
    setMenuFor(null)
    setError(null)
    setSaving(app.id)
    const res = await fetch(`/api/applications/${app.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }).catch(() => null)
    setSaving(null)
    if (!res?.ok) setError(app.id)
    router.refresh()
  }

  const onKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
  const { counts } = data

  return (
    <>
      <header className={`op-header seq${shown ? ' in' : ''}`}>
        <div>
          <h1 className="op-title">Applications</h1>
          <div className="op-subtitle">What Careerely has prepared, and what you’ve applied to.</div>
          {/* Master Brief §11: the record of work Careerely has done. */}
          <div className="page-summary" style={{ marginTop: 14 }} data-testid="app-summary">
            <div className="ps-item">
              <span className="ps-n">{counts.prepared.toLocaleString('en-US')}</span>
              <span>{counts.prepared === 1 ? 'application prepared' : 'applications prepared'}</span>
            </div>
            <span className="ps-sep">·</span>
            <div className="ps-item">
              <span className="ps-n">{counts.applied.toLocaleString('en-US')}</span>
              <span>applied</span>
            </div>
            <span className="ps-sep">·</span>
            <div className="ps-item">
              <span className="ps-n">{counts.interviews.toLocaleString('en-US')}</span>
              <span>{counts.interviews === 1 ? 'interview' : 'interviews'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* READY TO APPLY */}
      <section className={`seq${shown ? ' in' : ''}`} aria-label="Ready to apply" style={{ marginBottom: 48 }}>
        <div className="op-section">
          <span className="section-label">Ready to apply</span>
          <span className="op-count" data-testid="ready-count">
            {plural(data.ready.length, 'application', 'applications')}
          </span>
        </div>
        {data.ready.length === 0 ? (
          <div className="empty-line" style={{ textAlign: 'left' }}>
            No applications ready to submit right now.
          </div>
        ) : (
          <div className="ap-ready-list">
            {data.ready.map(a => {
              const tile = logoTile(a.company)
              return (
                <div key={a.id} className="ap-ready" role="button" tabIndex={0} data-testid="ready-card" onClick={() => setPanel(a.opportunityId)} onKeyDown={e => onKey(e, () => setPanel(a.opportunityId))}>
                  <div className="ap-ready-left">
                    <div className="op-pick-top" style={{ marginBottom: 14 }}>
                      <LogoTile company={a.company} letter={tile.letter} color={tile.color} size={44} />
                      <div style={{ minWidth: 0 }}>
                        <div className="opp-role" style={{ fontSize: 15 }}>
                          {a.title}
                        </div>
                        <div className="opp-meta">
                          <Meta parts={[a.company, ...a.meta].filter(Boolean)} />
                        </div>
                      </div>
                    </div>
                    <div className="chips">
                      {a.matchScore !== null && <span className="chip chip-match">{a.matchScore}% match</span>}
                      {a.evidence.map((e, i) => (
                        <span key={i} className={`chip chip-ev${e.outcome === 'inferred' ? ' inferred' : ''}`} title={e.outcome === 'inferred' ? `My judgment: ${e.claim}` : e.claim}>
                          ✓ <span>{e.claim}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ap-ready-right">
                    {a.postingClosed ? (
                      <div className="op-prep pending">Posting no longer listed</div>
                    ) : (
                      <div className="op-prep">
                        {a.hasChanges && (
                          <span>
                            <Check />
                            Resume tailored
                          </span>
                        )}
                        <span>
                          <Check />
                          Cover letter drafted
                        </span>
                      </div>
                    )}
                    <button
                      className="btn-review"
                      onClick={e => {
                        e.stopPropagation()
                        setPanel(a.opportunityId)
                      }}
                    >
                      Review application
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* YOUR APPLICATIONS */}
      <section className={`seq${shown ? ' in' : ''}`} aria-label="Your applications">
        <div className="op-section">
          <span className="section-label">Your applications</span>
          <span className="op-count" data-testid="submitted-count">
            {plural(data.submitted.length, 'application', 'applications')}
          </span>
        </div>
        {data.submitted.length === 0 ? (
          <div className="empty-line" style={{ textAlign: 'left' }}>
            No applications yet.
          </div>
        ) : (
          <div>
            {data.submitted.map(a => {
              const tile = logoTile(a.company)
              const key = a.outcome ?? a.status
              return (
                <Fragment key={a.id}>
                  <div
                    className={`ap-row${a.outcome ? ' closed' : ''}`}
                    role="button"
                    tabIndex={0}
                    data-testid="app-row"
                    onClick={() => setPanel(a.opportunityId)}
                    onKeyDown={e => onKey(e, () => setPanel(a.opportunityId))}
                  >
                    <LogoTile company={a.company} letter={tile.letter} color={tile.color} size={34} />
                    <div className="opp-body">
                      <div className="opp-role">{a.title}</div>
                      <div className="opp-meta">
                        <Meta parts={[a.company, a.location].filter((p): p is string => Boolean(p))} />
                      </div>
                    </div>
                    <div className="ap-right">
                      <span className={`status-pill st-${key}`} data-testid="status-pill">
                        {STATUS_LABEL[key]}
                      </span>
                      {a.appliedAt && <span className="ap-date">Applied {shortDate(a.appliedAt)}</span>}
                      {!readOnly && (
                        <div className="ap-menu-wrap">
                          <button
                            className="status-btn"
                            aria-haspopup="menu"
                            aria-expanded={menuFor === a.id}
                            disabled={saving === a.id}
                            onClick={e => {
                              e.stopPropagation()
                              setMenuFor(m => (m === a.id ? null : a.id))
                            }}
                          >
                            {saving === a.id ? 'Saving…' : 'Update'}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                          {menuFor === a.id && <StatusMenu app={a} onChoose={change => changeStatus(a, change)} onClose={closeMenu} />}
                        </div>
                      )}
                    </div>
                  </div>
                  {error === a.id && <div className="ft-error" style={{ padding: '0 0 12px 50px' }}>Couldn’t update this application. Please try again.</div>}
                </Fragment>
              )
            })}
          </div>
        )}
      </section>

      <OpportunityPanel opportunityId={panel} isMyPick={false} readOnly={readOnly} onClose={closePanel} onDismiss={() => {}} onApplied={() => router.refresh()} />
    </>
  )
}

