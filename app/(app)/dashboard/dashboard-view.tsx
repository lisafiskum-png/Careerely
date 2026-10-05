'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { DashActivity, DashboardData, DashOpportunity } from '../../../lib/dashboard'
import { greeting, logoTile } from '../../../lib/display'
import { LogoTile } from '../_components/logo-tile'
import { OpportunityPanel } from '../_components/opportunity-panel'
import { RelTime } from '../_components/rel-time'
import { DismissPrompt, type DismissReason } from '../_components/dismiss-prompt'

// Motion follows design/dashboard-final.html (locked): header + stats count up,
// My Pick reveals, shortlist rows stagger 70ms, Applications and Activity reveal
// on scroll, dismissal collapses (380ms) and counts fade to the new value, the
// source row pulses when the panel opens.

const STAGGER = 55
const DISMISS_MS = 380

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Counts from 0 to `target` once `start` is true (ease-out cubic), then follows `target`. */
function useCountUp(target: number, duration: number, start: boolean) {
  const [value, setValue] = useState(0)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    if (!start || finished) return
    const t0 = performance.now()
    const reduced = prefersReducedMotion()
    let raf = 0
    const step = (now: number) => {
      const p = reduced ? 1 : Math.min((now - t0) / duration, 1)
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) raf = requestAnimationFrame(step)
      else setFinished(true)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [start, finished, target, duration])
  return { value: finished ? target : value, finished }
}

/** Fades a number out and back in when it changes (Master Brief → dismissal cascade). */
function FadeNumber({ value }: { value: string }) {
  const [shown, setShown] = useState(value)
  const fading = value !== shown
  useEffect(() => {
    if (!fading) return
    const t = setTimeout(() => setShown(value), 150)
    return () => clearTimeout(t)
  }, [fading, value])
  return <span style={{ opacity: fading ? 0 : 1, transition: 'opacity .2s' }}>{shown}</span>
}

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

const Check = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const Arrow = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

function ActivityIcon({ icon }: { icon: DashActivity['icon'] }) {
  const common = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }
  if (icon === 'scan')
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    )
  if (icon === 'shortlist')
    return (
      <svg {...common}>
        <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12" />
      </svg>
    )
  if (icon === 'closed')
    return (
      <svg {...common}>
        <line x1="6" y1="12" x2="18" y2="12" />
      </svg>
    )
  if (icon === 'prepared')
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      </svg>
    )
  return (
    <svg {...common} strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function DashboardView({ data, firstName, readOnly }: { data: DashboardData; firstName: string | null; readOnly: boolean }) {
  const router = useRouter()
  const [greet, setGreet] = useState('')
  const [headerIn, setHeaderIn] = useState(false)
  const [countsOn, setCountsOn] = useState(false)
  const [pickIn, setPickIn] = useState(false)
  const [oppsIn, setOppsIn] = useState(false)
  const [rowsIn, setRowsIn] = useState(0)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set())
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const [dismissError, setDismissError] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ id: string; isPick: boolean } | null>(null)
  const [pulse, setPulse] = useState<string | null>(null)
  const appsRef = useRef<HTMLElement>(null)
  const actRef = useRef<HTMLElement>(null)

  const pick = data.pick && !gone.has(data.pick.id) ? data.pick : null
  const rows = data.rows.filter(r => !gone.has(r.id))
  // Counts cover every live opportunity, not just the rows previewed here.
  const goneRows = data.rows.length - rows.length
  const shortlisted = data.stats.shortlisted - goneRows - (data.pick && !pick ? 1 : 0)
  const otherCount = data.otherCount - goneRows
  const ready = data.apps.filter(a => !gone.has(a.id)).length

  const nShort = useCountUp(data.stats.shortlisted, 700, countsOn)
  const nReady = useCountUp(data.stats.ready, 500, countsOn)
  const nReviewed = useCountUp(data.stats.reviewedInLatest ?? 0, 1100, countsOn)

  // Load sequence.
  useEffect(() => {
    const timers = [
      setTimeout(() => setGreet(greeting(new Date().getHours(), firstName)), 0),
      setTimeout(() => setHeaderIn(true), 60),
      setTimeout(() => setCountsOn(true), 260),
      setTimeout(() => setPickIn(true), 60 + STAGGER * 4),
      setTimeout(() => setOppsIn(true), 60 + STAGGER * 8),
    ]
    return () => timers.forEach(clearTimeout)
  }, [firstName])

  useEffect(() => {
    if (!oppsIn) return
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setRowsIn(Infinity), 0)
      return () => clearTimeout(t)
    }
    const timers = data.rows.map((_, i) => setTimeout(() => setRowsIn(n => Math.max(n, i + 1)), i * 70))
    timers.push(setTimeout(() => setRowsIn(Infinity), data.rows.length * 70))
    return () => timers.forEach(clearTimeout)
    // Rows that arrive later (after a refresh) appear revealed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppsIn])

  // Scroll reveals for the sections below the fold.
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.reveal!
            setRevealed(r => ({ ...r, [id]: true }))
            obs.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' },
    )
    for (const el of [appsRef.current, actRef.current]) if (el) obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const openPanel = useCallback((id: string, isPick: boolean) => {
    setPulse(null)
    requestAnimationFrame(() => setPulse(isPick ? 'pick' : id))
    setTimeout(() => setPulse(null), 600)
    setPanel({ id, isPick })
  }, [])
  const closePanel = useCallback(() => setPanel(null), [])

  // "Not for me": ask first (reason optional); nothing changes until confirmed.
  const requestDismiss = useCallback(
    (id: string) => {
      if (panel?.id === id) setPanel(null)
      setDismissError(null)
      setConfirmFor(id)
    },
    [panel],
  )
  const cancelDismiss = useCallback(() => setConfirmFor(null), [])

  const confirmDismiss = useCallback(
    async (id: string, reason: DismissReason | null) => {
      setConfirmFor(null)
      const res = await fetch(`/api/opportunities/${id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => null)
      if (!res?.ok) {
        // Nothing was dismissed: say so, and re-read in case the opportunity changed.
        setDismissError(id)
        router.refresh()
        return
      }
      setCollapsing(s => new Set(s).add(id))
      setTimeout(() => {
        setGone(s => new Set(s).add(id))
        setCollapsing(s => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
        router.refresh()
      }, DISMISS_MS)
    },
    [router],
  )

  const onApplied = useCallback(() => router.refresh(), [router])

  const prompt = (id: string) => <DismissPrompt key={`dismiss-${id}`} onConfirm={reason => confirmDismiss(id, reason)} onCancel={cancelDismiss} />
  const dismissFailed = (id: string) =>
    dismissError === id && (
      <div className="ft-error" role="alert" data-testid="dismiss-error" style={{ padding: '8px 0' }}>
        Couldn’t dismiss this opportunity. Please try again.
      </div>
    )

  const rowKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

  const noScanYet = !data.stats.lastScanAt
  const pickTile = pick ? logoTile(pick.company) : null
  const pickReady = pick?.state === 'ready'

  return (
    <>
      {/* HEADER — resolves first with stats counting up */}
      <div className={`page-header seq${headerIn ? ' in' : ''}`}>
        <div className="page-greeting">{greet}</div>
        <h1 className="page-h1">
          Here&apos;s what Careerely
          <br />
          found for you.
        </h1>
        <div className="page-summary" data-testid="stat-line">
          <div className="ps-item">
            <span className="ps-n">{nShort.finished ? <FadeNumber value={String(shortlisted)} /> : nShort.value}</span>
            <span>shortlisted</span>
          </div>
          <span className="ps-sep">·</span>
          <div className="ps-item">
            <span className="ps-n">{nReady.finished ? <FadeNumber value={String(ready)} /> : nReady.value}</span>
            <span>{ready === 1 ? 'application ready' : 'applications ready'}</span>
          </div>
          {data.stats.reviewedInLatest !== null && (
            <>
              <span className="ps-sep">·</span>
              <div className="ps-item">
                <span className="ps-n">{nReviewed.value.toLocaleString('en-US')}</span>
                <span>reviewed in latest scan</span>
              </div>
            </>
          )}
          {data.stats.lastScanAt && (
            <>
              <span className="ps-sep">·</span>
              <div className="ps-item">
                <span>last scan</span>
                <span className="ps-n">
                  <RelTime iso={data.stats.lastScanAt} />
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MY PICK */}
      <section className={`pick-section seq${pickIn ? ' in' : ''}`} aria-label="My pick">
        <div className="pick-label">My pick</div>
        {pick && pickTile ? (
          <div
            className={`pick${pulse === 'pick' ? ' row-pulse' : ''}`}
            role="button"
            tabIndex={0}
            data-testid="my-pick"
            style={collapsing.has(pick.id) ? { opacity: 0, transform: 'translateX(8px)', transition: `opacity ${DISMISS_MS}ms var(--ease), transform ${DISMISS_MS}ms var(--ease)` } : undefined}
            onClick={() => openPanel(pick.id, true)}
            onKeyDown={e => rowKey(e, () => openPanel(pick.id, true))}
          >
            <div className="pick-body">
              <LogoTile company={pick.company} letter={pickTile.letter} color={pickTile.color} size={48} />
              <div className="pick-content">
                <div className="pick-company">{pick.company}</div>
                <div className="pick-role">{pick.title}</div>
                {pick.meta.length > 0 && (
                  <div className="pick-meta">
                    <Meta parts={pick.meta} />
                  </div>
                )}
                {pick.evidence.length > 0 && (
                  <div className="pick-evidence">
                    {pick.evidence.map((e, i) => (
                      <div className="ev" key={i}>
                        <span className={`ev-mark${e.outcome === 'inferred' ? ' inferred' : ''}`} aria-hidden>
                          ✓
                        </span>
                        {e.claim}
                      </div>
                    ))}
                  </div>
                )}
                {pick.reasoning && <div className="pick-why">{pick.reasoning}</div>}
              </div>
              <div className="pick-aside">
                {pick.matchScore !== null && (
                  <div className="pick-match">
                    <div className="match-n">{pick.matchScore}%</div>
                    <div className="match-l">match</div>
                  </div>
                )}
                <button
                  className="btn-review"
                  onClick={e => {
                    e.stopPropagation()
                    openPanel(pick.id, true)
                  }}
                >
                  {pickReady ? 'Review application' : 'View opportunity'}
                  <Arrow />
                </button>
              </div>
            </div>
            {pickReady && (
              <div className="pick-done">
                {pick.hasChanges && (
                  <>
                    <Check />
                    Resume tailored
                    <span className="done-sep">·</span>
                  </>
                )}
                <Check />
                Cover letter drafted
              </div>
            )}
            {pick.state === 'preparing' && <div className="pick-done pending">Preparing application…</div>}
          </div>
        ) : (
          <div className="empty-line" style={{ textAlign: 'left', padding: '4px 0 0' }} data-testid="pick-empty">
            {data.scan.state === 'scanning' && noScanYet
              ? 'Your first scan is running. Opportunities will appear here when it finishes.'
              : data.anyDismissed || gone.size > 0
                ? 'You’ve reviewed everything shortlisted. Careerely will surface new opportunities as they appear.'
                : 'Nothing shortlisted yet. Careerely will surface new opportunities as they appear.'}
          </div>
        )}
        {pick && confirmFor === pick.id && !readOnly && <div style={{ marginTop: 12 }}>{prompt(pick.id)}</div>}
        {pick && dismissFailed(pick.id)}
      </section>

      {/* ALSO SHORTLISTED */}
      {(pick || rows.length > 0 || data.rows.length > 0) && (
        <section className={`opps-section seq${oppsIn ? ' in' : ''}`} aria-label="Also shortlisted">
          <div className="section-header">
            <span className="section-label">
              Also shortlisted{' '}
              <span className="section-count">
                (<FadeNumber value={String(otherCount)} />)
              </span>
            </span>
            <Link href="/opportunities" className="section-action">
              View all opportunities →
            </Link>
          </div>
          <div>
            {data.rows.map((r: DashOpportunity, i) => {
              if (gone.has(r.id)) return null
              const tile = logoTile(r.company)
              const shown = rowsIn > i
              return (
                <Fragment key={r.id}>
                <div
                  className={`opp-row seq${shown ? ' in' : ''}${collapsing.has(r.id) ? ' dismissing' : ''}${pulse === r.id ? ' row-pulse' : ''}`}
                  role="button"
                  tabIndex={0}
                  data-testid="shortlist-row"
                  onClick={() => openPanel(r.id, false)}
                  onKeyDown={e => rowKey(e, () => openPanel(r.id, false))}
                >
                  <LogoTile company={r.company} letter={tile.letter} color={tile.color} size={34} />
                  <div className="opp-body">
                    <div className="opp-role">{r.title}</div>
                    <div className="opp-meta">
                      <Meta parts={[r.company, ...r.meta].filter(Boolean)} />
                    </div>
                  </div>
                  <div className="opp-right">
                    {r.matchScore !== null && <span className="opp-pct">{r.matchScore}%</span>}
                    {r.state === 'ready' && <span className="opp-badge">Application ready</span>}
                    {r.state === 'preparing' && <span className="opp-badge pending">Preparing application…</span>}
                    {r.state === 'shortlisted' && !readOnly && (
                      <button
                        className="opp-dismiss"
                        title="Not for me"
                        onClick={e => {
                          e.stopPropagation()
                          requestDismiss(r.id)
                        }}
                      >
                        Not for me
                      </button>
                    )}
                    <Arrow className="opp-arrow" />
                  </div>
                </div>
                {confirmFor === r.id && !readOnly && prompt(r.id)}
                {dismissFailed(r.id)}
                </Fragment>
              )
            })}
            {pick && rows.length === 0 && otherCount === 0 && (
              <div className="empty-line">You’ve reviewed everything shortlisted. Careerely will surface new opportunities as they appear.</div>
            )}
          </div>
        </section>
      )}

      {/* APPLICATIONS READY */}
      <section
        ref={appsRef}
        data-reveal="apps"
        className={`apps-section seq${revealed.apps ? ' in' : ''}`}
        aria-label="Applications ready"
        hidden={data.apps.length === 0}
      >
        <div className="section-header">
          <span className="section-label">Applications ready</span>
          <Link href="/applications" className="section-action">
            View all →
          </Link>
        </div>
        <div>
          {data.apps
            .filter(a => !gone.has(a.id))
            .map(a => {
              const tile = logoTile(a.company)
              return (
                <div key={a.id} className="app-row" role="button" tabIndex={0} onClick={() => openPanel(a.id, a.id === pick?.id)} onKeyDown={e => rowKey(e, () => openPanel(a.id, a.id === pick?.id))}>
                  <LogoTile company={a.company} letter={tile.letter} color={tile.color} size={34} />
                  <div className="app-body">
                    <div className="app-role">{a.title}</div>
                    <div className="app-meta">{[a.company, ...a.meta.slice(1)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="app-complete">
                    <span className="complete-label">Application complete</span>
                    <button
                      className="btn-review-app"
                      onClick={e => {
                        e.stopPropagation()
                        openPanel(a.id, a.id === pick?.id)
                      }}
                    >
                      Review →
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </section>

      {/* RECENT ACTIVITY */}
      <section ref={actRef} data-reveal="activity" className={`seq${revealed.activity ? ' in' : ''}`} aria-label="Recent activity" hidden={data.activity.length === 0}>
        <div className="section-header">
          <span className="section-label">Recent activity</span>
        </div>
        <div>
          {data.activity.map(a => (
            <div className="act-row" key={a.id}>
              <div className={`act-icon${a.icon === 'applied' ? ' done' : ''}`}>
                <ActivityIcon icon={a.icon} />
              </div>
              <div className="act-body">
                <div className="act-text">{a.parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <strong key={i}>{p.strong}</strong>))}</div>
                <div className="act-time">
                  <RelTime iso={a.at} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <OpportunityPanel
        opportunityId={panel?.id ?? null}
        isMyPick={Boolean(panel?.isPick)}
        readOnly={readOnly}
        onClose={closePanel}
        onDismiss={requestDismiss}
        onApplied={onApplied}
      />
    </>
  )
}

