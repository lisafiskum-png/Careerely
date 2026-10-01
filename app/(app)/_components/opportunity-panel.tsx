'use client'
import { useEffect, useRef, useState } from 'react'
import type { OpportunityDetail } from '../../../lib/opportunity-detail'
import { logoTile } from '../../../lib/display'
import { LogoTile } from './logo-tile'

// The opportunity panel from design/dashboard-final.html (locked): Summary
// (Why I picked this · What Careerely changed · Things I considered), Resume,
// Cover letter, The role. Content is loaded per opportunity from stored records.

type Tab = 'summary' | 'resume' | 'cover' | 'role'

const CHANGE_TAG: Record<string, { label: string; cls: string }> = {
  reworded: { label: 'Reworded', cls: 'ci-pu' },
  added: { label: 'Added', cls: 'ci-gn' },
  removed: { label: 'Removed', cls: 'ci-pu' },
  reordered: { label: 'Moved', cls: 'ci-gn' },
}

const SOURCE_LABEL = { resume: 'From your resume', posting: 'From the posting', preferences: 'From your preferences', judgment: 'From the posting and your resume' } as const

const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

const REQ_LABEL = { confirmed: 'Confirmed', inferred: 'My judgment', unknown: 'Couldn’t confirm' } as const

const STATUS_LABEL: Record<string, string> = { applied: 'Applied', interview: 'Interview', offer: 'Offer', declined: 'Declined', withdrawn: 'Withdrawn' }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

type PanelProps = {
  opportunityId: string | null
  isMyPick: boolean
  readOnly: boolean
  onClose: () => void
  onDismiss: (id: string) => void
  onApplied: (id: string) => void
}

export function OpportunityPanel(props: PanelProps) {
  const { opportunityId, onClose } = props
  const open = opportunityId !== null
  // Keep the last opportunity's content while the panel slides out.
  const [shownId, setShownId] = useState<string | null>(opportunityId)
  if (opportunityId && opportunityId !== shownId) setShownId(opportunityId)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <div className={`panel-wrap${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="panel-bg" onClick={onClose} />
      {shownId ? <PanelContent key={shownId} {...props} opportunityId={shownId} open={open} /> : <aside className="panel" />}
    </div>
  )
}

function PanelContent({ opportunityId, isMyPick, readOnly, onClose, onDismiss, onApplied, open }: PanelProps & { opportunityId: string; open: boolean }) {
  const [detail, setDetail] = useState<OpportunityDetail | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('summary')
  const [menu, setMenu] = useState(false)
  const [ask, setAsk] = useState(false)
  const [applyState, setApplyState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/opportunities/${opportunityId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: OpportunityDetail) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [opportunityId])

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.p-ov-btn') && !t.closest('.p-ov-menu')) setMenu(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  const d = detail
  const pkg = d?.package
  const ready = d?.state === 'ready' && pkg?.status === 'ready'
  const canAskApplied = Boolean(d?.application && d.application.status === 'ready_to_apply' && !d.application.outcome && !readOnly)
  // Applied / Interview / Offer, or closed (Declined / Withdrawn): tracked on Applications.
  const submitted = d?.application && d.application.status !== 'ready_to_apply' ? d.application : null
  const submittedLabel = submitted
    ? `${STATUS_LABEL[submitted.outcome ?? submitted.status] ?? ''}${submitted.appliedAt && !submitted.outcome && submitted.status === 'applied' ? ` · ${shortDate(submitted.appliedAt)}` : ''}`
    : null
  const canDismiss = d?.state === 'shortlisted' && !readOnly
  const tile = logoTile(d?.company)

  function continueToPosting() {
    // Postings come from third-party job boards: only ever open web links.
    if (!d?.url || !isWebUrl(d.url)) return
    window.open(d.url, '_blank', 'noopener,noreferrer')
    if (canAskApplied) setAsk(true)
  }

  async function markApplied() {
    if (!d?.application) return
    setApplyState('saving')
    const res = await fetch(`/api/applications/${d.application.id}/applied`, { method: 'POST' }).catch(() => null)
    if (res?.ok) {
      setApplyState('done')
      onApplied(d.id)
    } else setApplyState('error')
  }

  const notPrepared = (what: 'application' | 'cover') =>
    d?.state === 'preparing' ? (
      <div className="not-ready">
        <div className="not-ready-title">Preparing application…</div>
      </div>
    ) : (
      <div className="not-ready">
        <div className="not-ready-title">Application not prepared yet</div>
        <div className="not-ready-desc">
          {what === 'cover'
            ? 'Careerely shortlisted this opportunity but hasn’t prepared a cover letter for it.'
            : 'Careerely shortlisted this opportunity but hasn’t prepared an application for it. Applications are prepared for the highest-priority opportunities first.'}
        </div>
      </div>
    )

  const changedLines = new Set((pkg?.changes ?? []).map(c => c.revisedText).filter((t): t is string => Boolean(t)).map(norm))

  return (
      <aside className="panel" role="dialog" aria-modal="true" aria-label={d ? `${d.title} at ${d.company}` : 'Opportunity'}>
        <div className="p-hd">
          <div className="p-bar">
            {d ? <LogoTile letter={tile.letter} color={tile.color} size={44} /> : <span className="logo logo-44" style={{ background: 'var(--bg)' }} />}
            <div className="p-info">
              <div className="p-company">{d?.company ?? ''}</div>
              <div className="p-role">{d?.title ?? (error ? 'This opportunity isn’t available.' : '')}</div>
              {d && d.meta.length > 0 && <div className="p-meta">{d.meta.join(' · ')}</div>}
            </div>
            <button ref={closeRef} className="p-close" onClick={onClose} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {d && (
            <div className="p-chips">
              {submittedLabel && <Chip kind="gray">{submittedLabel}</Chip>}
              {ready && !submitted && pkg?.hasChanges && <Chip kind="g">Resume tailored</Chip>}
              {ready && !submitted && <Chip kind="g">Cover letter drafted</Chip>}
              {d.state === 'preparing' && <Chip kind="gray">Preparing application…</Chip>}
              {isMyPick && <Chip kind="v">My pick</Chip>}
            </div>
          )}
          <div className="p-tabs" role="tablist">
            {(
              [
                ['summary', 'Summary'],
                ['resume', 'Resume'],
                ['cover', 'Cover letter'],
                ['role', 'The role'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`ptab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-body">
          {!d && !error && <div className="p-loading">Loading…</div>}
          {!d && error && (
            <div className="p-loading" role="alert" data-testid="panel-error">
              Couldn’t load this opportunity. Please try again.
            </div>
          )}
          {d && tab === 'summary' && (
            <>
              {d.evidence.length > 0 && (
              <div className="psec">
                  <div className="psec-lbl">Why I picked this</div>
                  <div className="ev-rows">
                    {d.evidence.map(e => (
                      <div className="ev-row" key={e.id}>
                        <span className={`ev-row-check${e.outcome === 'inferred' ? ' inferred' : ''}`} aria-hidden>
                          ✓
                        </span>
                        <div>
                          <div className="ev-row-skill">{e.claim}</div>
                          <div className="ev-row-proof">
                            {e.outcome === 'inferred' ? 'My judgment · ' : ''}
                            {SOURCE_LABEL[e.source]}: “{e.quote}”
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="psec">
                <div className="psec-lbl">What Careerely changed</div>
                {ready ? (
                  pkg!.changes.length ? (
                    <div className="change-list">
                      {pkg!.changes.map((c, i) => {
                        const tag = CHANGE_TAG[c.changeType] ?? CHANGE_TAG.reworded
                        return (
                          <div className="change-item" key={i}>
                            <span className={`ci-tag ${tag.cls}`}>{tag.label}</span>
                            {c.text}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="con-item">Your resume is used as it is for this role; the cover letter is written for it.</div>
                  )
                ) : (
                  notPrepared('application')
                )}
              </div>
              {d.considered.length > 0 && (
                <div className="psec">
                  <div className="psec-lbl">Things I considered</div>
                  <div className="con-list">
                    {d.considered.map((t, i) => (
                      <div className="con-item" key={i}>
                        <div className="con-dot" />
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {d.timeline.length > 1 && (
                <div className="psec">
                  <div className="psec-lbl">Timeline</div>
                  <div className="timeline" data-testid="timeline">
                    {d.timeline.map((t, i) => (
                      <div className="tl-item" key={i}>
                        <span className={`tl-dot${i === 0 ? ' now' : ''}`} aria-hidden />
                        <div>
                          <div className="tl-label">{t.label}</div>
                          <div className="tl-date">{shortDate(t.at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {d && tab === 'resume' && (
            <div className="psec">
              {ready && pkg!.resumeText ? (
                <>
                  <div className="psec-lbl">Tailored for {d.company}</div>
                  <div className="doc-text">
                    {pkg!.resumeText.split('\n').map((line, i) => {
                      const changed = changedLines.size > 0 && [...changedLines].some(c => norm(line).includes(c))
                      return (
                        <div key={i} className={`doc-line${changed ? ' doc-changed' : ''}`}>
                          {line}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                notPrepared('application')
              )}
            </div>
          )}
          {d && tab === 'cover' && (
            <div className="psec">
              {ready && pkg!.coverLetter.length ? (
                <>
                  <div className="psec-lbl">Cover letter · {d.company}</div>
                  <div className="doc-text">
                    {pkg!.coverLetter.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </>
              ) : (
                notPrepared('cover')
              )}
            </div>
          )}
          {d && tab === 'role' && (
            <div className="psec">
              <div className="psec-lbl">Role details</div>
              <div className="doc-text">
                <p>
                  <strong>{d.title}</strong>
                  <br />
                  {[d.company, ...d.meta].filter(Boolean).join(' · ')}
                </p>
                {(d.description ?? '')
                  .split(/\n{2,}/)
                  .filter(p => p.trim())
                  .map((p, i) => (
                    <p key={i} style={{ whiteSpace: 'pre-wrap' }}>
                      {p}
                    </p>
                  ))}
              </div>
              {d.requirements.length > 0 && (
                <div className="psec" style={{ marginTop: 24 }}>
                  <div className="psec-lbl">Requirements</div>
                  <div className="req-list">
                    {d.requirements.map((r, k) => (
                      <div className="req-item" key={k}>
                        <span className={`req-tag req-${r.outcome}`}>{REQ_LABEL[r.outcome]}</span>
                        <span>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {d && (
          <div className="p-ft">
            {applyState === 'done' ? (
              <div className="ft-done">Marked as applied.</div>
            ) : ask ? (
              <>
                <div className="ft-ask">Did you apply?</div>
                <button className="btn-pa" onClick={markApplied} disabled={applyState === 'saving'}>
                  {applyState === 'saving' ? 'Saving…' : 'Yes, I applied'}
                </button>
                <button className="btn-ghost" onClick={() => setAsk(false)}>
                  Not yet
                </button>
                {applyState === 'error' && <div className="ft-error">Couldn’t save that. Please try again.</div>}
              </>
            ) : (
              <>
                {submitted ? (
                  <div className="ft-status" data-testid="panel-status">
                    {submittedLabel}
                  </div>
                ) : !d.postingListed ? (
                  <div className="ft-status">Posting no longer listed</div>
                ) : (
                  <button className="btn-pa" onClick={continueToPosting} disabled={!d.url}>
                    {ready ? 'Continue to application →' : 'View the posting →'}
                  </button>
                )}
                {(ready || canDismiss) && (
                  <button className="p-ov-btn" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                      <circle cx="5" cy="12" r="1" />
                    </svg>
                  </button>
                )}
                {menu && (
                  <div className="p-ov-menu" role="menu">
                    {ready && (
                      <>
                        <a className="pom-item" role="menuitem" href={`/api/opportunities/${d.id}/documents/resume`} download>
                          Download resume PDF
                        </a>
                        <a className="pom-item" role="menuitem" href={`/api/opportunities/${d.id}/documents/cover-letter`} download>
                          Download cover letter PDF
                        </a>
                      </>
                    )}
                    {canDismiss && (
                      <button
                        className="pom-item danger"
                        role="menuitem"
                        onClick={() => {
                          setMenu(false)
                          onDismiss(d.id)
                        }}
                      >
                        Not for me
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </aside>
  )
}

function Chip({ kind, children }: { kind: 'g' | 'v' | 'gray'; children: React.ReactNode }) {
  return (
    <span className={`pch pch-${kind}`}>
      {kind === 'g' && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {children}
    </span>
  )
}
