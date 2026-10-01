'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { OpportunitiesData, OpportunityListItem } from '../../../lib/opportunities'
import { logoTile } from '../../../lib/display'
import { LogoTile } from '../_components/logo-tile'
import { OpportunityPanel } from '../_components/opportunity-panel'
import { RelTime } from '../_components/rel-time'

// Layout from design/opportunities-wip.html (reference), visual language and
// motion from the locked dashboard. States are kept distinct: Shortlisted (no
// preparation indicators), Preparing (still reviewable), Ready.

const DISMISS_MS = 380
const REASONS = [
  ['role', 'Role'],
  ['company', 'Company'],
  ['location', 'Location'],
  ['salary', 'Salary'],
  ['industry', 'Industry'],
  ['other', 'Other'],
] as const

const Check = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function Chips({ item }: { item: OpportunityListItem }) {
  return (
    <div className="chips">
      {item.matchScore !== null && <span className="chip chip-match">{item.matchScore}% match</span>}
      {item.evidence.map((e, i) => (
        <span key={i} className={`chip chip-ev${e.outcome === 'inferred' ? ' inferred' : ''}`} title={e.outcome === 'inferred' ? `My judgment: ${e.claim}` : e.claim}>
          ✓ <span>{e.claim}</span>
        </span>
      ))}
    </div>
  )
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

export function OpportunitiesView({ data, readOnly }: { data: OpportunitiesData; readOnly: boolean }) {
  const router = useRouter()
  const [shown, setShown] = useState(0) // 0 = nothing; 1 = header; 2 = pick; 3+ = rows revealed
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set())
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ id: string; isPick: boolean } | null>(null)
  const [pulse, setPulse] = useState<string | null>(null)

  const pick = data.pick && !gone.has(data.pick.id) ? data.pick : null
  const others = data.others.filter(o => !gone.has(o.id))
  const total = (pick ? 1 : 0) + others.length

  useEffect(() => {
    const timers = [setTimeout(() => setShown(1), 60), setTimeout(() => setShown(2), 180)]
    data.others.forEach((_, i) => timers.push(setTimeout(() => setShown(s => Math.max(s, 3 + i)), 300 + i * 70)))
    timers.push(setTimeout(() => setShown(Infinity), 300 + data.others.length * 70))
    return () => timers.forEach(clearTimeout)
    // Rows that arrive after a refresh appear revealed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPanel = useCallback((id: string, isPick: boolean) => {
    setPulse(null)
    requestAnimationFrame(() => setPulse(id))
    setTimeout(() => setPulse(null), 600)
    setPanel({ id, isPick })
  }, [])
  const closePanel = useCallback(() => setPanel(null), [])

  const dismiss = useCallback(
    async (id: string) => {
      if (panel?.id === id) setPanel(null)
      setReasonFor(null)
      const res = await fetch(`/api/opportunities/${id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null)
      if (!res?.ok) return
      setCollapsing(s => new Set(s).add(id))
      setTimeout(() => {
        setGone(s => new Set(s).add(id))
        setCollapsing(s => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
        setReasonFor(id)
        router.refresh()
      }, DISMISS_MS)
    },
    [panel, router],
  )

  async function giveReason(id: string, reason: string | null) {
    setReasonFor(null)
    if (reason) {
      await fetch(`/api/opportunities/${id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => null)
    }
  }

  const reasonPicker = (id: string) => (
    <div className="reason-picker" key={`reason-${id}`} role="group" aria-label="Why not?">
      <span className="reason-label">Why not?</span>
      {REASONS.map(([value, label]) => (
        <button key={value} className="reason-btn" onClick={() => giveReason(id, value)}>
          {label}
        </button>
      ))}
      <button className="reason-skip" onClick={() => giveReason(id, null)}>
        Skip
      </button>
    </div>
  )

  const onKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

  const empty = !pick && others.length === 0
  const pickTile = pick ? logoTile(pick.company) : null
  const pickReady = pick?.state === 'ready'
  const orphanReason = reasonFor && !data.others.some(o => o.id === reasonFor) ? reasonFor : null

  return (
    <>
      <header className={`op-header seq${shown >= 1 ? ' in' : ''}`}>
        <div>
          <div className="op-eyebrow">For you</div>
          <h1 className="op-title" data-testid="op-title">
            {total} {total === 1 ? 'opportunity' : 'opportunities'}
          </h1>
          <div className="op-subtitle">
            Ranked by Careerely.
            {data.reviewedInLatest !== null && (
              <>
                {' '}
                <span className="ps-n">{data.reviewedInLatest.toLocaleString('en-US')}</span> reviewed in latest scan.
              </>
            )}
          </div>
        </div>
        {(data.scan.state === 'scanning' || data.scan.lastScanAt) && (
          <div className="scan-chip">
            <span className={`sdot${data.scan.state === 'scanning' ? ' live' : ''}`} aria-hidden />
            {data.scan.state === 'scanning' ? (
              'Scanning the market'
            ) : (
              <span>
                Last scan <RelTime iso={data.scan.lastScanAt!} />
              </span>
            )}
          </div>
        )}
      </header>

      {orphanReason && !readOnly && <div style={{ marginBottom: 24 }}>{reasonPicker(orphanReason)}</div>}

      {empty ? (
        <div className={`seq${shown >= 2 ? ' in' : ''}`}>
          {data.scan.state === 'scanning' && !data.scan.lastScanAt ? (
            <div className="empty-line" style={{ textAlign: 'left', padding: 0 }} data-testid="op-empty">
              Your first scan is running. Opportunities will appear here when it finishes.
            </div>
          ) : data.handledSome || gone.size > 0 ? (
            <div className="empty-block" data-testid="op-empty">
              <div className="empty-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="empty-title">You’re all caught up</h2>
              <p className="empty-desc">You’ve reviewed everything Careerely has shortlisted. New opportunities will appear here when Careerely finds ones worth your attention.</p>
              {/* TODO(D5): "Adjust your searches →" once the Searches page exists. */}
            </div>
          ) : (
            <div className="empty-line" style={{ textAlign: 'left', padding: 0 }} data-testid="op-empty">
              Nothing shortlisted yet. Careerely will surface new opportunities as they appear.
            </div>
          )}
        </div>
      ) : (
        <>
          {pick && pickTile && (
            <div
              className={`op-pick seq${shown >= 2 ? ' in' : ''}${pulse === pick.id ? ' row-pulse' : ''}`}
              role="button"
              tabIndex={0}
              data-testid="op-pick"
              style={collapsing.has(pick.id) ? { opacity: 0, transform: 'translateX(8px)', transition: `opacity ${DISMISS_MS}ms var(--ease), transform ${DISMISS_MS}ms var(--ease)` } : undefined}
              onClick={() => openPanel(pick.id, true)}
              onKeyDown={e => onKey(e, () => openPanel(pick.id, true))}
            >
              <div className="op-pick-inner">
                <div className="op-pick-left">
                  <div className="op-pick-top">
                    <LogoTile letter={pickTile.letter} color={pickTile.color} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div className="op-pick-badge">My pick</div>
                      <div className="op-pick-role">{pick.title}</div>
                      <div className="op-pick-co">
                        <Meta parts={[pick.company, ...pick.meta].filter(Boolean)} />
                      </div>
                    </div>
                  </div>
                  <Chips item={pick} />
                </div>
                <div className="op-pick-right">
                  {pick.reasoning && <div className="op-reasoning">{pick.reasoning}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pickReady && (
                      <div className="op-prep">
                        {pick.hasChanges && (
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
                    {pick.state === 'preparing' && <div className="op-prep pending">Preparing application…</div>}
                    <button
                      className="btn-review"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={e => {
                        e.stopPropagation()
                        openPanel(pick.id, true)
                      }}
                    >
                      {pickReady ? 'Review application' : 'View opportunity'}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <section className={`seq${shown >= 2 ? ' in' : ''}`} aria-label="Also shortlisted" hidden={others.length === 0 && !data.others.some(o => o.id === reasonFor)}>
            <div className="op-section">
              <span className="section-label">Also shortlisted</span>
              <span className="op-count" data-testid="op-count">
                {others.length} {others.length === 1 ? 'opportunity' : 'opportunities'}
              </span>
            </div>
            <div>
              {data.others.map((o, i) => {
                if (gone.has(o.id)) return reasonFor === o.id && !readOnly ? reasonPicker(o.id) : null
                const tile = logoTile(o.company)
                return (
                  <div
                    key={o.id}
                    className={`op-row seq${shown >= 3 + i ? ' in' : ''}${collapsing.has(o.id) ? ' dismissing' : ''}${pulse === o.id ? ' row-pulse' : ''}`}
                    role="button"
                    tabIndex={0}
                    data-testid="op-row"
                    onClick={() => openPanel(o.id, false)}
                    onKeyDown={e => onKey(e, () => openPanel(o.id, false))}
                  >
                    <LogoTile letter={tile.letter} color={tile.color} size={34} />
                    <div className="opp-body">
                      <div className="opp-role">{o.title}</div>
                      <div className="opp-meta">
                        <Meta parts={[o.company, ...o.meta].filter(Boolean)} />
                      </div>
                      <Chips item={o} />
                    </div>
                    <div className="op-right">
                      <div className="op-right-line">
                        {o.state === 'ready' && <span className="opp-badge">Application ready</span>}
                        {o.state === 'preparing' && <span className="opp-badge pending">Preparing application…</span>}
                        <button
                          className="btn-sm"
                          onClick={e => {
                            e.stopPropagation()
                            openPanel(o.id, false)
                          }}
                        >
                          Review
                        </button>
                      </div>
                      {o.state === 'shortlisted' && !readOnly && (
                        <button
                          className="opp-dismiss"
                          onClick={e => {
                            e.stopPropagation()
                            dismiss(o.id)
                          }}
                        >
                          Not for me
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      <OpportunityPanel
        opportunityId={panel?.id ?? null}
        isMyPick={Boolean(panel?.isPick)}
        readOnly={readOnly}
        onClose={closePanel}
        onDismiss={dismiss}
        onApplied={() => router.refresh()}
      />
    </>
  )
}
