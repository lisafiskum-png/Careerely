'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchCard, SearchesData } from '../../../lib/searches'
import { WORK_STYLES } from '../../../lib/onboarding'
import { formatMoney } from '../../../lib/search-input'
import { RelTime } from '../_components/rel-time'
import { SearchForm } from './search-form'

// Layout from design/searches-wip.html (reference) with the Master Brief §12
// fixes; visual language from the locked dashboard. Card numbers come from the
// latest completed scan of each search (decision 2026-10-01).

const WORK_STYLE_LABEL = Object.fromEntries(WORK_STYLES.map(w => [w.value, w.label])) as Record<string, string>

/** “A”, “A” and “B”, “A”, “B” and “C”. */
function quoteList(names: string[]): string {
  const q = names.map(n => `“${n}”`)
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}

const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size > 16 ? 1.5 : 2} strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

function ScanLine({ search, readOnly }: { search: SearchCard; readOnly: boolean }) {
  const last = search.latest?.finishedAt ?? null
  const lastLine = last ? (
    <>
      Last scan <RelTime iso={last} />
    </>
  ) : (
    'Not scanned yet'
  )
  let main: React.ReactNode
  let sub: React.ReactNode = null
  if (search.status === 'paused') {
    main = 'Paused'
    sub = lastLine
  } else if (readOnly) {
    // The engine doesn't scan for read-only accounts.
    main = lastLine
    sub = 'Not scanning while read-only'
  } else if (search.scan.state === 'scanning') {
    main = 'Scanning now…'
  } else if (search.scan.state === 'first') {
    main = 'First scan queued'
  } else {
    main = lastLine
    sub = 'Scans nightly'
  }
  return (
    <div className="sc-stat sc-scan" data-testid="scan-line">
      <div className="sc-scan-main">{main}</div>
      {sub && <div className="sc-stat-l">{sub}</div>}
    </div>
  )
}

function CardMenu({ search, onEdit, onToggle, onClose }: { search: SearchCard; onEdit: () => void; onToggle: () => void; onClose: () => void }) {
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
  return (
    <div className="status-menu" role="menu" ref={ref} onClick={e => e.stopPropagation()}>
      <button role="menuitem" className="sd-item" onClick={onEdit}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Edit search
      </button>
      <button role="menuitem" className="sd-item" onClick={onToggle}>
        {search.status === 'active' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
        {search.status === 'active' ? 'Pause search' : 'Resume search'}
      </button>
    </div>
  )
}

export function SearchesView({ data, readOnly }: { data: SearchesData; readOnly: boolean }) {
  const router = useRouter()
  const [shown, setShown] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; search: SearchCard } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [limitHit, setLimitHit] = useState(false)
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [])

  const closeMenu = useCallback(() => setMenuFor(null), [])
  const closeForm = useCallback(() => setForm(null), [])
  const { plan, activeCount, searches } = data
  const atLimit = plan !== null && plan.limit !== null && activeCount >= plan.limit

  const [noticeError, setNoticeError] = useState(false)
  async function dismissPlanNotice() {
    const res = await fetch('/api/searches/plan-change-notice', { method: 'DELETE' }).catch(() => null)
    setNoticeError(!res?.ok)
    router.refresh()
  }

  async function toggle(search: SearchCard) {
    setMenuFor(null)
    setError(null)
    setScanNotice(null)
    const next = search.status === 'active' ? 'paused' : 'active'
    // Resume is blocked at the plan's limit until another search is paused.
    if (next === 'active' && atLimit) {
      setLimitHit(true)
      return
    }
    setLimitHit(false)
    setSaving(search.id)
    const res = await fetch(`/api/searches/${search.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).catch(() => null)
    setSaving(null)
    if (res?.status === 409) setLimitHit(true)
    else if (!res?.ok) setError(search.id)
    else if (next === 'active') {
      const body = (await res.json().catch(() => null)) as { immediateScan?: boolean } | null
      // Over the daily allowance of immediate scans: resumed, but not scanning now.
      setScanNotice(body?.immediateScan === false ? 'Search resumed. Its next scan will run tonight.' : null)
    }
    router.refresh()
  }

  function saved(result: { status?: string; immediateScan?: boolean }) {
    setForm(null)
    setLimitHit(false)
    setScanNotice(result.status === 'active' && result.immediateScan === false ? 'Search saved. Its next scan will run tonight.' : null)
    router.refresh()
  }

  return (
    <>
      <header className={`op-header seq${shown ? ' in' : ''}`}>
        <div>
          <h1 className="op-title">Searches</h1>
          <div className="op-subtitle">What Careerely is hunting for on your behalf.</div>
        </div>
        {!readOnly && (
          <button className="btn-create" onClick={() => setForm({ mode: 'create' })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New search
          </button>
        )}
      </header>

      {plan && (
        <div className={`plan-bar seq${shown ? ' in' : ''}`} data-testid="plan-bar">
          <span>
            {plan.limit === null ? (
              <>
                <strong>{activeCount.toLocaleString('en-US')}</strong> {activeCount === 1 ? 'active search' : 'active searches'} · {plan.name} plan
              </>
            ) : (
              <>
                <strong>
                  {activeCount} of {plan.limit}
                </strong>{' '}
                active {plan.limit === 1 ? 'search' : 'searches'} · {plan.name} plan
              </>
            )}
          </span>
          <span className="plan-right">
            {plan.limit !== null && (
              <span className="usage-pips" aria-hidden>
                {Array.from({ length: plan.limit }, (_, i) => (
                  <span key={i} className={`pip${i < activeCount ? ' on' : ''}`} />
                ))}
              </span>
            )}
            <Link href="/settings" className="plan-manage">
              Manage plan →
            </Link>
          </span>
        </div>
      )}

      {data.planChangeNotice.length > 0 && (
        <div className="sc-banner sc-banner-row" role="status" data-testid="plan-change-banner">
          <span>
            Careerely paused {quoteList(data.planChangeNotice)} when your plan changed, to fit its active-search limit. Nothing was deleted; you can choose which searches stay active.
          </span>
          {!readOnly && (
            <button className="sc-dismiss" onClick={dismissPlanNotice}>
              Dismiss
            </button>
          )}
          {noticeError && (
            <span className="ft-error" role="alert">
              Couldn’t dismiss this notice. Please try again.
            </span>
          )}
        </div>
      )}

      {scanNotice && (
        <div className="sc-banner" role="status" data-testid="scan-deferred">
          {scanNotice}
        </div>
      )}

      {limitHit && atLimit && (
        <div className="sc-banner" role="status" data-testid="limit-banner">
          You’ve reached your active search limit. Pause another search to resume this one.
        </div>
      )}

      {searches.length > 0 && activeCount === 0 && !readOnly && (
        <div className="sc-banner" role="status" data-testid="all-paused-banner">
          Careerely isn’t currently searching. Resume a search below to start scanning the market again.
        </div>
      )}

      {searches.length === 0 ? (
        <div className={`empty-block seq${shown ? ' in' : ''}`} data-testid="searches-empty">
          <div className="empty-icon">
            <SearchIcon size={22} />
          </div>
          <h2 className="empty-title">No searches yet</h2>
          <p className="empty-desc">Careerely isn’t searching the market right now. Create a search to tell Careerely what to look for.</p>
          {!readOnly && (
            <button className="btn-create" style={{ margin: '20px auto 0' }} onClick={() => setForm({ mode: 'create' })}>
              Create search
            </button>
          )}
        </div>
      ) : (
        <div className="sc-list">
          {searches.map((s, i) => {
            const active = s.status === 'active'
            return (
              <article
                key={s.id}
                className={`sc-card seq${shown ? ' in' : ''}${active ? '' : ' paused'}`}
                style={{ transitionDelay: `${i * 50}ms` }}
                data-testid="search-card"
                aria-label={s.name}
              >
                <div className="sc-main">
                  <div className="sc-icon">
                    <SearchIcon />
                  </div>
                  <div className="sc-body">
                    <div className="sc-top">
                      <div style={{ minWidth: 0 }}>
                        <h2 className="sc-name">{s.name}</h2>
                        {s.createdFromProfile && <div className="sc-origin">Created from your preferences</div>}
                      </div>
                      <div className="sc-actions">
                        <span className={`sc-status ${active ? 'active' : 'paused'}`} data-testid="search-status">
                          <span className="sc-status-dot" />
                          {active ? 'Active' : 'Paused'}
                        </span>
                        {!readOnly && (
                          <div className="ap-menu-wrap">
                            <button
                              className="sc-menu-btn"
                              aria-label={`Options for ${s.name}`}
                              aria-haspopup="menu"
                              aria-expanded={menuFor === s.id}
                              disabled={saving === s.id}
                              onClick={e => {
                                e.stopPropagation()
                                setMenuFor(m => (m === s.id ? null : s.id))
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="19" cy="12" r="1" />
                                <circle cx="5" cy="12" r="1" />
                              </svg>
                            </button>
                            {menuFor === s.id && (
                              <CardMenu
                                search={s}
                                onEdit={() => {
                                  setMenuFor(null)
                                  setForm({ mode: 'edit', search: s })
                                }}
                                onToggle={() => toggle(s)}
                                onClose={closeMenu}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="sc-params" data-testid="search-params">
                      {s.targetRoles.map(r => (
                        <span key={`r-${r}`} className="sc-chip pu">
                          {r}
                        </span>
                      ))}
                      {s.industries.map(x => (
                        <span key={`i-${x}`} className="sc-chip">
                          {x}
                        </span>
                      ))}
                      {s.locations.map(x => (
                        <span key={`l-${x}`} className="sc-chip">
                          {x}
                        </span>
                      ))}
                      {s.workStyles.map(w => (
                        <span key={`w-${w}`} className="sc-chip">
                          {WORK_STYLE_LABEL[w]}
                        </span>
                      ))}
                      {s.minCompensation !== null && s.compensationCurrency && (
                        <span className="sc-chip">Min {formatMoney(s.minCompensation, s.compensationCurrency)} a year</span>
                      )}
                    </div>
                    <div className="sc-stats">
                      <div className="sc-stat">
                        <div className="sc-stat-n" data-testid="reviewed">
                          {s.latest ? s.latest.reviewed.toLocaleString('en-US') : '—'}
                        </div>
                        <div className="sc-stat-l">Reviewed in latest scan</div>
                      </div>
                      <div className="sc-stat">
                        <div className="sc-stat-n" data-testid="shortlisted">
                          {s.latest ? s.latest.shortlisted.toLocaleString('en-US') : '—'}
                        </div>
                        <div className="sc-stat-l">Shortlisted in latest scan</div>
                      </div>
                      <ScanLine search={s} readOnly={readOnly} />
                    </div>
                    {error === s.id && <div className="ft-error" style={{ marginTop: 10 }}>Couldn’t update this search. Please try again.</div>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {form && (
        <SearchForm
          key={form.mode === 'edit' ? form.search.id : 'new'}
          search={form.mode === 'edit' ? form.search : null}
          profile={data.profile}
          limit={plan?.limit ?? null}
          atLimit={atLimit}
          onClose={closeForm}
          onSaved={saved}
        />
      )}
    </>
  )
}
