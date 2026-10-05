'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MAX_INDUSTRIES, MAX_LOCATIONS, MAX_ROLES, WORK_STYLES, type WorkStyle } from '../../../lib/onboarding'
import { POPULAR, searchOptions, type ChipFieldId } from '../../../lib/onboarding-options'
import { PLANS, type PlanId } from '../../../lib/plans'
import s from '../../../components/onboarding/preferences.module.css'

// Step 3 — "Your next move" (design/onboarding-step3-wip.html; copy locked in
// CAREERELY_MASTER.md §7). Checkout sits on "Find my matches": preferences are
// saved first, and the first search only starts once the subscription is active.

type View = 'prefs' | 'plans' | 'confirming' | 'pending' | 'transition' | 'success'

export type PreferencesInitial = {
  roles: string[]
  industries: string[]
  workStyles: WorkStyle[]
  locations: string[]
  aiRoles: string[]
  aiIndustries: string[]
  highlights: string[]
  animateIn: boolean
}

const LIMITS: Partial<Record<ChipFieldId, number>> = { fn: MAX_ROLES, ai: MAX_INDUSTRIES, loc: MAX_LOCATIONS }
const PLACEHOLDERS: Record<ChipFieldId, string> = {
  fn: 'Add a role…',
  ai: 'Add another industry or domain…',
  loc: 'Search any city, country, or region…',
}
const TRANSITION_STEPS = [
  'Building your profile',
  'Analysing your experience',
  'Finding your opportunities',
  'Tailoring your first applications',
]
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

export function PreferencesStep({
  initial,
  selectedPlan,
  checkout,
  sessionId,
}: {
  initial: PreferencesInitial
  selectedPlan: PlanId | null
  checkout: 'success' | 'cancelled' | null
  sessionId: string | null
}) {
  const router = useRouter()
  const [view, setView] = useState<View>(checkout === 'success' && sessionId ? 'confirming' : 'prefs')
  const [roles, setRoles] = useState(initial.roles)
  const [industries, setIndustries] = useState(initial.industries)
  const [locations, setLocations] = useState(initial.locations)
  const [workStyles, setWorkStyles] = useState<WorkStyle[]>(initial.workStyles)
  const [aiValues] = useState(() => new Set([...initial.aiRoles, ...initial.aiIndustries]))
  const [plan, setPlan] = useState<PlanId | null>(selectedPlan)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    checkout === 'cancelled' ? 'Checkout was cancelled. Your preferences are saved — choose a plan when you’re ready.' : '',
  )
  const [analyzingRows, setAnalyzingRows] = useState(0)
  const [analyzingVisible, setAnalyzingVisible] = useState(initial.animateIn && initial.highlights.length > 0)
  const [analyzingFading, setAnalyzingFading] = useState(false)
  const [revealed, setRevealed] = useState(initial.animateIn ? 0 : Infinity)
  const [trShown, setTrShown] = useState(0)

  useEffect(() => {
    if (!initial.animateIn) return
    let cancelled = false
    ;(async () => {
      if (initial.highlights.length > 0) {
        await delay(250)
        for (let i = 1; i <= initial.highlights.length; i++) {
          if (cancelled) return
          setAnalyzingRows(i)
          await delay(i === initial.highlights.length ? 360 : 180)
        }
        setAnalyzingFading(true)
        await delay(300)
        setAnalyzingVisible(false)
      }
      const total = initial.roles.length + initial.industries.length
      for (let i = 1; i <= total; i++) {
        await delay(i === 1 ? 60 : 100)
        if (cancelled) return
        setRevealed(i)
      }
      setRevealed(Infinity)
    })()
    return () => {
      cancelled = true
    }
  }, [initial])

  const runTransition = useCallback(async () => {
    setTrShown(0)
    setView('transition')
    window.scrollTo({ top: 0, behavior: 'instant' })
    for (let i = 1; i <= TRANSITION_STEPS.length; i++) {
      await delay(i === 1 ? 350 : 700)
      setTrShown(i)
    }
    await delay(800)
    setView('success')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const complete = useCallback(
    async (body: object) => {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
      return data as { status: 'started' | 'checkout_required' | 'payment_pending'; selectedPlan?: PlanId | null }
    },
    [],
  )

  const confirmedRef = useRef(false)
  const confirmPayment = useCallback(async () => {
    setError('')
    setView('confirming')
    try {
      const result = await complete({ sessionId })
      if (result.status === 'started') {
        window.history.replaceState(null, '', '/onboarding/3')
        await runTransition()
      } else {
        setView('pending')
      }
    } catch (err) {
      setView('pending')
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [complete, runTransition, sessionId])

  useEffect(() => {
    if (view !== 'confirming' || confirmedRef.current) return
    confirmedRef.current = true
    void confirmPayment()
  }, [view, confirmPayment])

  async function findMatches() {
    setPending(true)
    setError('')
    setNotice('')
    try {
      const result = await complete({ preferences: { roles, industries, workStyles, locations } })
      if (result.status === 'started') {
        setPending(false)
        await runTransition()
        return
      }
      setPlan(p => p ?? result.selectedPlan ?? null)
      setView('plans')
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    setPending(false)
  }

  async function startCheckout() {
    if (!plan) return
    setPending(true)
    setError('')
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, flow: 'onboarding' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        const result = await complete({})
        if (result.status === 'started') {
          setPending(false)
          await runTransition()
          return
        }
      }
      if (!data.url) throw new Error(data.error || 'Could not start checkout.')
      window.location.assign(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.')
      setPending(false)
    }
  }

  function toggleWorkStyle(value: WorkStyle) {
    setWorkStyles(current => {
      if (current.includes(value)) return current.length === 1 ? current : current.filter(v => v !== value)
      return [...current, value]
    })
  }

  const visibleRoles = roles.slice(0, Math.min(roles.length, revealed))
  const visibleIndustries = industries.slice(0, Math.max(0, Math.min(industries.length, revealed - roles.length)))
  const workStyleLabels = WORK_STYLES.filter(w => workStyles.includes(w.value)).map(w => w.label)

  return (
    <div className={s.page}>
      <nav>
        <div className={s.nav}>
          <Link href="/" className={s.logo}>
            Career<em>ely</em>
          </Link>
          <span className={s.navStep}>Last step</span>
        </div>
      </nav>

      <div className={s.main}>
        {view === 'prefs' && (
          <div>
            <div className={s.dots}>
              <div className={`${s.dot} ${s.dotDone}`} />
              <div className={`${s.dot} ${s.dotDone}`} />
              <div className={`${s.dot} ${s.dotActive}`} />
            </div>

            <div className={s.heading}>
              <h1>Your next move</h1>
              <p>We&apos;ve built your professional profile. Now let&apos;s personalise your search.</p>
            </div>

            {notice && <p className={s.notice}>{notice}</p>}

            <div className={s.group}>
              {analyzingVisible && (
                <div className={`${s.analyzing} ${analyzingFading ? s.analyzingHidden : ''}`} aria-live="polite">
                  {initial.highlights.map((h, i) => (
                    <div key={h} className={`${s.analyzingRow} ${i < analyzingRows ? s.analyzingRowShow : ''}`}>
                      <span className={s.analyzingTick}>✓</span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={s.fieldRow}>
                <div className={s.fieldHead}>
                  <span className={s.fieldLabel} id="fn-label">
                    Desired roles
                  </span>
                  <span className={s.fieldCounter}>{roles.length >= MAX_ROLES ? '' : `Choose up to ${MAX_ROLES}`}</span>
                </div>
                <p className={s.fieldHint}>Suggested from your resume. Edit if needed.</p>
                <ChipField id="fn" labelledBy="fn-label" values={roles} visible={visibleRoles} aiValues={aiValues} onChange={setRoles} />
              </div>

              <div className={s.fieldRow} style={{ marginBottom: 12 }}>
                <div className={s.fieldHead}>
                  <span className={s.fieldLabel} id="ai-label">
                    Industries &amp; domains
                  </span>
                  <span className={s.fieldCounter}>{industries.length >= MAX_INDUSTRIES ? '' : `Up to ${MAX_INDUSTRIES}`}</span>
                </div>
                <ChipField id="ai" labelledBy="ai-label" values={industries} visible={visibleIndustries} aiValues={aiValues} onChange={setIndustries} />
              </div>
            </div>

            <div className={s.groupDivider} />

            <div className={s.group}>
              <p className={s.groupLabel}>Preferences</p>
              <p className={s.groupDesc}>Tell us how and where you&apos;d ideally like to work.</p>

              <div className={s.fieldRow}>
                <div className={s.fieldHead} style={{ marginBottom: 12 }}>
                  <span className={s.fieldLabel}>How you&apos;d like to work</span>
                </div>
                <div className={s.wsOpts} role="group" aria-label="How you'd like to work">
                  {WORK_STYLES.map(w => {
                    const on = workStyles.includes(w.value)
                    return (
                      <button key={w.value} type="button" className={`${s.ws} ${on ? s.wsOn : ''}`} aria-pressed={on} onClick={() => toggleWorkStyle(w.value)}>
                        <svg className={s.wsTick} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {w.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={s.fieldRow}>
                <div className={s.fieldHead}>
                  <span className={s.fieldLabel} id="loc-label">
                    Preferred locations
                  </span>
                  <span className={s.fieldCounter} style={{ color: 'var(--faint)' }}>
                    Optional
                  </span>
                </div>
                <ChipField id="loc" labelledBy="loc-label" values={locations} visible={locations} aiValues={aiValues} onChange={setLocations} />
              </div>
            </div>

            <p className={s.payoff}>
              We&apos;ll combine your experience with your preferences to find better matches and tailor every application.
            </p>
          </div>
        )}

        {view === 'plans' && (
          <div>
            <div className={s.heading}>
              <h1>Choose your plan</h1>
              <p>Careerely starts searching as soon as your subscription is active. Cancel anytime.</p>
            </div>
            <div className={s.plans} role="radiogroup" aria-label="Plan">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={plan === p.id}
                  className={`${s.plan} ${plan === p.id ? s.planOn : ''}`}
                  onClick={() => setPlan(p.id)}
                >
                  <span>
                    <span className={s.planName}>{p.name}</span>
                    <span className={s.planFeatures} style={{ display: 'block' }}>
                      {p.features.join(' · ')}
                    </span>
                  </span>
                  <span className={s.planPrice}>
                    ${p.monthlyPriceUsd} <span>/mo</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className={s.btn} disabled={!plan || pending} onClick={startCheckout}>
              {pending ? 'Opening checkout…' : 'Continue to payment'}
            </button>
            <p className={s.error} role="alert">
              {error}
            </p>
            <button type="button" className={s.backLink} onClick={() => { setError(''); setView('prefs') }}>
              Back to your preferences
            </button>
          </div>
        )}

        {view === 'confirming' && (
          <div className={s.view}>
            <p className={s.trTitle}>Confirming your payment…</p>
          </div>
        )}

        {view === 'pending' && (
          <div className={s.view}>
            <p className={s.trTitle}>Your payment is still processing</p>
            <p className={s.successText}>
              We’ll start your search as soon as Stripe confirms it. This usually takes a few seconds.
            </p>
            <button type="button" className={s.btn} onClick={confirmPayment}>
              Check again
            </button>
            <p className={s.error} role="alert">
              {error}
            </p>
          </div>
        )}

        {view === 'transition' && (
          <div className={s.view}>
            <p className={s.trTitle}>Finding your opportunities</p>
            <div className={s.trSteps}>
              {TRANSITION_STEPS.map((label, i) => (
                <div key={label} className={`${s.trStep} ${i < trShown ? s.trStepShow : ''}`}>
                  <span className={s.trTick}>✓</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'success' && (
          <div className={s.view}>
            <div className={s.successWrap}>
              <div className={s.sico}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className={s.successTitle}>You&apos;re all set</h1>
              <p className={s.successText}>
                Careerely is now finding roles that fit your profile. We&apos;ll let you know when your first opportunities are ready.
              </p>
              <div className={s.summaryCard}>
                <div className={s.summaryHead}>
                  <span className={s.summaryLabel}>Your search preferences</span>
                  <button type="button" className={s.summaryEdit} onClick={() => setView('prefs')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                    Edit
                  </button>
                </div>
                <div className={s.summaryRows}>
                  <SummaryRow label="Roles" values={roles} empty="Not specified" />
                  <SummaryRow label="Industries" values={industries} empty="Not specified" />
                  <SummaryRow label="Work style" values={workStyleLabels} empty="Not specified" />
                  <SummaryRow label="Location" values={locations} empty="Open to any location" />
                </div>
              </div>
              <button type="button" className={s.btn} onClick={() => router.push('/dashboard')}>
                Go to my dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {view === 'prefs' && (
        <div className={s.ctaBar}>
          <div className={s.ctaInner}>
            <button type="button" className={s.btn} disabled={roles.length === 0 || pending} onClick={findMatches}>
              {pending ? 'Saving…' : 'Find my matches'}
            </button>
            <p className={s.error} role="alert">
              {error}
            </p>
            <p className={s.ctaNote}>You can update these anytime from your dashboard.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, values, empty }: { label: string; values: string[]; empty: string }) {
  return (
    <div className={s.summaryRow}>
      <span className={s.summaryKey}>{label}</span>
      <ul className={s.summaryVals}>
        {(values.length ? values : [empty]).map(v => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  )
}

function ChipField({
  id,
  labelledBy,
  values,
  visible,
  aiValues,
  onChange,
}: {
  id: ChipFieldId
  labelledBy: string
  values: string[]
  visible: string[]
  aiValues: Set<string>
  onChange: (values: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [globalLocations, setGlobalLocations] = useState<string[]>([])
  const limit = LIMITS[id]
  const full = limit !== undefined && values.length >= limit

  useEffect(() => {
    if (id !== 'loc') return
    const q = query.trim()
    setGlobalLocations([])
    if (q.length < 2) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(q)}`, { signal: controller.signal }).catch(() => null)
      if (!response?.ok) return
      const data = (await response.json().catch(() => null)) as { suggestions?: unknown } | null
      if (Array.isArray(data?.suggestions)) {
        setGlobalLocations(data.suggestions.filter((value): value is string => typeof value === 'string'))
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [id, query])

  const q = query.trim()
  const items: { value: string; custom?: boolean }[] = []
  let heading: string | null = null
  if (!full) {
    if (!q) {
      const popular = (POPULAR[id] || []).filter(p => !values.includes(p)).slice(0, 8)
      if (popular.length) heading = id === 'loc' ? 'Popular locations' : 'Popular'
      popular.forEach(p => items.push({ value: p }))
    } else {
      const matches = id === 'loc' && globalLocations.length > 0 ? globalLocations : searchOptions(id, q, values)
      if (id === 'loc' && globalLocations.length > 0) heading = 'Locations worldwide'
      matches
        .filter(v => !values.some(chosen => chosen.toLowerCase() === v.toLowerCase()))
        .forEach(v => items.push({ value: v }))
      const exact =
        items.some(i => i.value.toLowerCase() === q.toLowerCase()) || values.some(v => v.toLowerCase() === q.toLowerCase())
      if (!exact && q.length > 1) items.push({ value: q, custom: true })
    }
  }
  const showDrop = open && items.length > 0

  function add(value: string) {
    const v = value.trim()
    if (!v || full) return
    if (!values.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setQuery('')
    setGlobalLocations([])
    setHighlight(-1)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight >= 0 && items[highlight]) add(items[highlight].value)
      else if (q) add(q)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && !query && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div
      className={`${s.field} ${full ? s.fieldFull : ''}`}
      onClick={() => {
        inputRef.current?.focus()
        setOpen(true)
      }}
    >
      <div className={s.fieldBody}>
        {visible.map(v => (
          <span key={v} className={`${s.chip} ${aiValues.has(v) ? s.chipAi : s.chipUser}`}>
            {v}
            <button
              type="button"
              className={s.chipRm}
              aria-label={`Remove ${v}`}
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                onChange(values.filter(x => x !== v))
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={s.fieldInp}
          aria-labelledby={labelledBy}
          placeholder={full ? '' : PLACEHOLDERS[id]}
          autoComplete="off"
          disabled={full}
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setHighlight(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showDrop && (
        <div className={s.drop} role="listbox">
          {heading && <div className={s.dropHead}>{heading}</div>}
          {items.map((item, i) => (
            <div
              key={`${item.custom ? 'custom:' : ''}${item.value}`}
              role="option"
              aria-selected={i === highlight}
              className={`${s.ditem} ${i === highlight ? s.ditemHi : ''} ${item.custom ? s.ditemCustom : ''}`}
              onMouseDown={e => {
                e.preventDefault()
                add(item.value)
              }}
            >
              {item.custom ? `Add "${item.value}"` : item.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
