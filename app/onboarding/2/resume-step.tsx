'use client'
import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { emptyEducation, emptyExperience, type Resume } from '../../../lib/resume/schema'
import { BackIcon, CheckIcon, ProgressDots } from '../../../components/onboarding/shell'
import s from '../../../components/onboarding/onboarding.module.css'

// Step 2 — Resume upload (design/onboarding-step1-step2-final.html, LOCKED).
// State machine (DESIGN_INDEX.md): upload → parsing → review. Never one form.

type Phase = 'upload' | 'parsing' | 'parsed' | 'review'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
    </svg>
  )
}

export function ResumeStep({ userId, draft }: { userId: string; draft: Resume | null }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>(draft ? 'review' : 'upload')
  const [fileName, setFileName] = useState('')
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [resume, setResume] = useState<Resume | null>(draft)
  const [saving, setSaving] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > MAX_BYTES) return setError('This file is over 10MB. Try a smaller version.')
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(pdf|doc|docx)$/i.test(file.name)) {
      return setError('We only accept PDF, DOC, or DOCX files.')
    }

    setFileName(file.name)
    setPhase('parsing')
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
    const path = `${userId}/${Date.now()}-${safeName}`
    try {
      const { error: uploadError } = await createClient().storage
        .from('resumes')
        .upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (uploadError) throw new Error('Upload failed. Please try again.')
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'We couldn’t read your resume.')
      setResume(data.resume)
      setPhase('parsed')
    } catch (err) {
      setPhase('upload')
      setError(err instanceof Error ? err.message : 'We couldn’t read your resume.')
    }
  }

  function removeFile() {
    if (inputRef.current) inputRef.current.value = ''
    setFileName('')
    setError('')
    setResume(draft)
    setPhase('upload')
  }

  async function confirm() {
    if (!resume) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/resume/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'We couldn’t save your resume. Please try again.')
        return
      }
      router.push('/onboarding/3')
      router.refresh()
    } catch {
      setError('We couldn’t save your resume. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'review' && resume) {
    return (
      <>
        <ProgressDots step={2} />
        <div className={s.step}>
          <p className={s.stepLabel}>Step 2 of 3</p>
          <h1>Review your profile</h1>
          <p className={s.sub}>
            We’ve read your resume. Correct anything we got wrong — Careerely uses this to tailor every application.
          </p>
          <ResumeReview resume={resume} onChange={setResume} />
          <button type="button" className={s.btnPrimary} onClick={confirm} disabled={saving}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
          <p className={s.error} role="alert">
            {error}
          </p>
          <button type="button" className={s.backBtn} onClick={() => setPhase('upload')}>
            <BackIcon />
            Upload a different resume
          </button>
        </div>
      </>
    )
  }

  const pillClass =
    phase === 'parsing' ? `${s.filePill} ${s.filePillProcessing}` : `${s.filePill} ${s.filePillSuccess}`

  return (
    <>
      <ProgressDots step={2} />
      <div className={s.step}>
        <p className={s.stepLabel}>Step 2 of 3</p>
        <h1>Upload your resume</h1>
        <p className={s.sub}>
          We&apos;ll read it once and use it to tailor every application you send. Your original is never modified.
        </p>

        {phase === 'upload' && (
          <div
            className={`${s.uploadZone} ${drag ? s.uploadZoneDrag : ''} ${error ? s.uploadZoneError : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Upload your resume"
            aria-describedby="uploadError"
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={e => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false)
            }}
            onDrop={e => {
              e.preventDefault()
              setDrag(false)
              handleFile(e.dataTransfer.files[0])
            }}
          >
            <div className={s.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3>Drop your resume here</h3>
            <p>
              or <span className={s.browse}>browse to upload</span>
            </p>
            <p className={s.formats}>PDF, DOC or DOCX · Max 10MB</p>
            <input
              ref={inputRef}
              className={s.hiddenInput}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {(phase === 'parsing' || phase === 'parsed') && (
          <div className={pillClass}>
            <div className={s.filePillIcon}>{phase === 'parsed' ? <CheckIcon size={14} stroke="currentColor" width={2.5} /> : <FileIcon />}</div>
            <div className={s.filePillBody}>
              <span className={s.filePillName}>{fileName}</span>
              <span className={s.filePillStatus} aria-live="polite">
                {phase === 'parsing' ? 'Reading your resume…' : 'Resume received'}
              </span>
            </div>
            {phase === 'parsed' && (
              <button type="button" className={s.filePillRemove} onClick={removeFile} aria-label="Remove file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <p className={s.error} id="uploadError" role="alert" aria-live="assertive">
          {error}
        </p>

        <p className={s.uploadTrust}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Encrypted and never shared
        </p>

        <button
          type="button"
          className={s.btnPrimary}
          style={{ marginTop: 20 }}
          disabled={phase !== 'parsed'}
          onClick={() => setPhase('review')}
        >
          Continue
        </button>
        {draft && phase === 'upload' && (
          <button type="button" className={s.backBtn} onClick={() => { setResume(draft); setPhase('review') }}>
            <BackIcon />
            Back to your profile
          </button>
        )}
      </div>
    </>
  )
}

// ── Review ──────────────────────────────────────────────────────────────────

function ResumeReview({ resume, onChange }: { resume: Resume; onChange: (r: Resume) => void }) {
  const set = <K extends keyof Resume>(key: K, value: Resume[K]) => onChange({ ...resume, [key]: value })

  return (
    <div>
      <section className={s.reviewSection}>
        <div className={s.reviewSectionHead}>
          <span className={s.reviewSectionTitle}>About you</span>
        </div>
        <TextField label="Full name" value={resume.full_name} onChange={v => set('full_name', v)} autoComplete="name" />
        <TextField label="Headline" value={resume.headline} onChange={v => set('headline', v)} placeholder="e.g. AML compliance professional" />
        <div className={s.twoCol}>
          <TextField label="Location" value={resume.location} onChange={v => set('location', v)} />
          <TextField label="Phone" value={resume.phone} onChange={v => set('phone', v)} autoComplete="tel" />
        </div>
        <TextField label="Email" value={resume.email} onChange={v => set('email', v)} autoComplete="email" />
        <div className={s.field}>
          <label htmlFor="summary">Summary</label>
          <textarea id="summary" className={s.textarea} value={resume.summary} onChange={e => set('summary', e.target.value)} />
        </div>
        <TagField label="Links" values={resume.links} onChange={v => set('links', v)} placeholder="Add a link and press Enter" />
      </section>

      <section className={s.reviewSection}>
        <div className={s.reviewSectionHead}>
          <span className={s.reviewSectionTitle}>Experience</span>
          <button type="button" className={s.reviewAdd} onClick={() => set('experience', [...resume.experience, emptyExperience()])}>
            + Add role
          </button>
        </div>
        {resume.experience.map((exp, i) => {
          const update = (patch: Partial<typeof exp>) =>
            set('experience', resume.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)))
          return (
            <div key={i} className={s.reviewItem}>
              <div className={s.reviewItemHead}>
                <button type="button" className={s.reviewRemove} onClick={() => set('experience', resume.experience.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
              <div className={s.twoCol}>
                <TextField label="Title" value={exp.title} onChange={v => update({ title: v })} />
                <TextField label="Company" value={exp.company} onChange={v => update({ company: v })} />
                <TextField label="Start" value={exp.start} onChange={v => update({ start: v })} placeholder="e.g. Jan 2021" />
                <TextField label="End" value={exp.current ? '' : exp.end} onChange={v => update({ end: v })} placeholder={exp.current ? 'Present' : 'e.g. Mar 2024'} disabled={exp.current} />
              </div>
              <div className={s.agree} style={{ marginTop: 0, marginBottom: 16 }}>
                <input type="checkbox" id={`current-${i}`} checked={exp.current} onChange={e => update({ current: e.target.checked, end: '' })} />
                <label htmlFor={`current-${i}`}>I currently work here</label>
              </div>
              <TextField label="Location" value={exp.location} onChange={v => update({ location: v })} />
              <div className={s.field}>
                <label htmlFor={`hl-${i}`}>Highlights</label>
                <textarea
                  id={`hl-${i}`}
                  className={s.textarea}
                  value={exp.highlights.join('\n')}
                  onChange={e => update({ highlights: e.target.value.split('\n') })}
                  placeholder="One achievement per line"
                />
              </div>
            </div>
          )
        })}
      </section>

      <section className={s.reviewSection}>
        <div className={s.reviewSectionHead}>
          <span className={s.reviewSectionTitle}>Education</span>
          <button type="button" className={s.reviewAdd} onClick={() => set('education', [...resume.education, emptyEducation()])}>
            + Add education
          </button>
        </div>
        {resume.education.map((edu, i) => {
          const update = (patch: Partial<typeof edu>) =>
            set('education', resume.education.map((e, j) => (j === i ? { ...e, ...patch } : e)))
          return (
            <div key={i} className={s.reviewItem}>
              <div className={s.reviewItemHead}>
                <button type="button" className={s.reviewRemove} onClick={() => set('education', resume.education.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
              <TextField label="School" value={edu.institution} onChange={v => update({ institution: v })} />
              <div className={s.twoCol}>
                <TextField label="Degree" value={edu.degree} onChange={v => update({ degree: v })} />
                <TextField label="Field of study" value={edu.field} onChange={v => update({ field: v })} />
                <TextField label="Start" value={edu.start} onChange={v => update({ start: v })} />
                <TextField label="End" value={edu.end} onChange={v => update({ end: v })} />
              </div>
            </div>
          )
        })}
      </section>

      <section className={s.reviewSection}>
        <div className={s.reviewSectionHead}>
          <span className={s.reviewSectionTitle}>Skills &amp; more</span>
        </div>
        <TagField label="Skills" values={resume.skills} onChange={v => set('skills', v)} placeholder="Add a skill and press Enter" />
        <TagField label="Languages" values={resume.languages} onChange={v => set('languages', v)} placeholder="Add a language and press Enter" />
        <TagField label="Certifications" values={resume.certifications} onChange={v => set('certifications', v)} placeholder="Add a certification and press Enter" />
      </section>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={s.inp}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

function TagField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const id = useId()
  const add = () => {
    const v = draft.trim()
    if (v && !values.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      {values.length > 0 && (
        <div className={s.tagList}>
          {values.map((v, i) => (
            <span key={`${v}-${i}`} className={s.tag}>
              {v}
              <button type="button" className={s.tagRemove} aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className={s.inp}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
      />
    </div>
  )
}
