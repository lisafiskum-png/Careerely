'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { ProfileDefaults, SearchCard } from '../../../lib/searches'
import { MAX_INDUSTRIES, MAX_LOCATIONS, MAX_ROLES, WORK_STYLES, type WorkStyle } from '../../../lib/onboarding'
import { AREAS, FUNCTIONS, LOCATIONS } from '../../../lib/onboarding-options'
import { CURRENCIES, currencyLabel, formatMoney, parseAmount, validateSearch } from '../../../lib/search-input'

// Create / edit a search (Master Brief §12). Career Profile values and resume
// suggestions come first as chips; the user can add their own roles,
// industries and locations. Work style stays a fixed choice. The form only
// ever writes the search: it never changes the Career Profile.

function uniq(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter(v => {
    const k = v.trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

type Chips = { options: string[]; selected: string[] }

function ChipField({
  label,
  hint,
  value,
  max,
  placeholder,
  addLabel,
  suggestions,
  onChange,
}: {
  label: string
  hint: string
  value: Chips
  max: number
  placeholder: string
  addLabel: string
  suggestions: string[]
  onChange: (next: Chips) => void
}) {
  const [draft, setDraft] = useState('')
  const [full, setFull] = useState(false)
  const id = useId()
  const isOn = (v: string) => value.selected.some(s => s.toLowerCase() === v.toLowerCase())

  function toggle(v: string) {
    setFull(false)
    if (isOn(v)) return onChange({ ...value, selected: value.selected.filter(s => s.toLowerCase() !== v.toLowerCase()) })
    if (value.selected.length >= max) return setFull(true)
    onChange({ ...value, selected: [...value.selected, v] })
  }

  function add() {
    const v = draft.trim().slice(0, 80)
    if (!v) return
    const existing = value.options.find(o => o.toLowerCase() === v.toLowerCase())
    if (existing && isOn(existing)) return setDraft('')
    if (value.selected.length >= max) return setFull(true)
    setDraft('')
    setFull(false)
    onChange({ options: existing ? value.options : [...value.options, v], selected: [...value.selected, existing ?? v] })
  }

  return (
    <div className="sf-group" role="group" aria-labelledby={`${id}-l`}>
      <div className="sf-label-row">
        <span className="sf-label" id={`${id}-l`}>
          {label}
        </span>
        <span className="sf-hint">{hint}</span>
      </div>
      {value.options.length > 0 && (
        <div className="sf-chips">
          {value.options.map(o => (
            <button key={o} type="button" className={`pick-chip${isOn(o) ? ' on' : ''}`} aria-pressed={isOn(o)} onClick={() => toggle(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      <div className="sf-add">
        <input
          className="sf-input sm"
          value={draft}
          placeholder={placeholder}
          aria-label={addLabel}
          list={`${id}-opts`}
          maxLength={80}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <datalist id={`${id}-opts`}>
          {suggestions.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" className="sf-add-btn" onClick={add}>
          Add
        </button>
      </div>
      {full && <div className="sf-note">You can choose up to {max}. Deselect one to add another.</div>}
    </div>
  )
}

export function SearchForm({
  search,
  profile,
  limit,
  atLimit,
  onClose,
  onSaved,
}: {
  search: SearchCard | null
  profile: ProfileDefaults
  limit: number | null
  atLimit: boolean
  onClose: () => void
  /** For a new search: whether its scan started now (false = it waits for tonight). */
  onSaved: (result: { status?: string; immediateScan?: boolean }) => void
}) {
  const editing = search !== null
  const [name, setName] = useState(search?.name ?? '')
  const [roles, setRoles] = useState<Chips>(() => {
    const selected = search ? search.targetRoles : profile.targetRoles.slice(0, MAX_ROLES)
    return { selected, options: uniq([...selected, ...profile.targetRoles, ...profile.suggestedRoles]) }
  })
  const [industries, setIndustries] = useState<Chips>(() => {
    const selected = search ? search.industries : profile.industries.slice(0, MAX_INDUSTRIES)
    return { selected, options: uniq([...selected, ...profile.industries, ...profile.suggestedIndustries]) }
  })
  const [locations, setLocations] = useState<Chips>(() => {
    const selected = search ? search.locations : profile.locations.slice(0, MAX_LOCATIONS)
    return { selected, options: uniq([...selected, ...profile.locations]) }
  })
  const [workStyles, setWorkStyles] = useState<WorkStyle[]>(search ? search.workStyles : profile.workStyles)
  const [amount, setAmount] = useState(search?.minCompensation ? search.minCompensation.toLocaleString('en-GB') : '')
  const [currency, setCurrency] = useState(search?.compensationCurrency ?? profile.compensation?.currency ?? '')
  const [forcedPaused, setForcedPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  // Creating at the plan's limit saves the search as paused, and says so first.
  const pausedMode = !editing && (atLimit || forcedPaused)

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  async function submit() {
    setError('')
    const parsedAmount = parseAmount(amount)
    if (Number.isNaN(parsedAmount)) return setError('Enter the minimum as a whole annual amount, or leave it blank.')
    const body = {
      name,
      targetRoles: roles.selected,
      industries: industries.selected,
      locations: locations.selected,
      workStyles,
      minCompensation: parsedAmount,
      compensationCurrency: parsedAmount === null ? null : currency || null,
    }
    const check = validateSearch(body)
    if (!check.ok) return setError(check.error)

    setSaving(true)
    const res = await fetch(editing ? `/api/searches/${search.id}` : '/api/searches', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? body : { ...body, status: pausedMode ? 'paused' : 'active' }),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok) return onSaved(((await res.json().catch(() => null)) ?? {}) as { status?: string; immediateScan?: boolean })
    const data = (await res?.json().catch(() => null)) as { error?: string } | null
    if (res?.status === 409 && data?.error === 'active_search_limit') {
      // Never pause silently: nothing was saved; the user chooses "Save as paused".
      setForcedPaused(true)
      return
    }
    setError(res?.status === 400 && data?.error ? data.error : 'Couldn’t save this search. Please try again.')
  }

  const saveLabel = editing ? 'Save changes' : pausedMode ? 'Save as paused' : 'Start search'

  return (
    <div className="sf-wrap" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="search-form">
        <div className="sf-hd">
          <h2 className="sf-title" id={titleId}>
            {editing ? 'Edit search' : 'New search'}
          </h2>
          {editing ? (
            <div className="sf-scope">
              <p data-testid="edit-scope">Changes apply to this search only and will not affect your Career Profile.</p>
              <p data-testid="edit-next-scan">New settings apply from the next scan.</p>
            </div>
          ) : (
            <p className="sf-origin">Pre-filled from your Career Profile. Changes here apply to this search only.</p>
          )}
        </div>

        <div className="sf-body">
          <div className="sf-group">
            <label className="sf-label" htmlFor={`${titleId}-name`}>
              Search name
            </label>
            <input
              ref={nameRef}
              id={`${titleId}-name`}
              className="sf-input"
              value={name}
              maxLength={80}
              placeholder="e.g. Fintech Business Development"
              onChange={e => setName(e.target.value)}
            />
          </div>

          <ChipField label="Target roles" hint={`1–${MAX_ROLES}`} value={roles} max={MAX_ROLES} placeholder="Add a role…" addLabel="Add a role" suggestions={FUNCTIONS} onChange={setRoles} />
          <ChipField label="Industries" hint={`Up to ${MAX_INDUSTRIES}`} value={industries} max={MAX_INDUSTRIES} placeholder="Add an industry…" addLabel="Add an industry" suggestions={AREAS} onChange={setIndustries} />
          <ChipField label="Locations" hint={`Up to ${MAX_LOCATIONS}`} value={locations} max={MAX_LOCATIONS} placeholder="Add a location…" addLabel="Add a location" suggestions={LOCATIONS} onChange={setLocations} />

          <div className="sf-group" role="group" aria-labelledby={`${titleId}-ws`}>
            <div className="sf-label-row">
              <span className="sf-label" id={`${titleId}-ws`}>
                Work style
              </span>
            </div>
            <div className="sf-chips">
              {WORK_STYLES.map(w => {
                const on = workStyles.includes(w.value)
                return (
                  <button
                    key={w.value}
                    type="button"
                    className={`pick-chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setWorkStyles(ws => (on ? ws.filter(x => x !== w.value) : [...ws, w.value]))}
                  >
                    {w.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="sf-group" style={{ marginBottom: 0 }}>
            <label className="sf-label" htmlFor={`${titleId}-amount`}>
              Minimum compensation <span className="sf-optional">(optional)</span>
            </label>
            <div className="sf-comp">
              <input
                id={`${titleId}-amount`}
                className="sf-input"
                inputMode="numeric"
                value={amount}
                placeholder="e.g. 70,000"
                onChange={e => setAmount(e.target.value)}
              />
              <select className="sf-input sf-currency" aria-label="Currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="">Currency</option>
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>
                    {currencyLabel(c)}
                  </option>
                ))}
              </select>
              <span className="sf-per">per year</span>
            </div>
            <div className="sf-note" data-testid="comp-help">
              {profile.compensation
                ? `Leave blank to use your Career Profile preference (${formatMoney(profile.compensation.amount, profile.compensation.currency)} a year).`
                : 'Leave blank for no minimum.'}
            </div>
          </div>
        </div>

        {pausedMode && (
          <div className="sf-limit" role="status" data-testid="limit-message">
            You’ve reached {limit !== null ? `${limit} active ${limit === 1 ? 'search' : 'searches'}` : 'your active search limit'}. This search will be saved as paused.
          </div>
        )}

        <div className="sf-ft">
          {error && (
            <div className="ft-error sf-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="btn-ghost sf-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-create sf-btn" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
