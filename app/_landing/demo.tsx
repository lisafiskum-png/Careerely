'use client'
import { useEffect, useRef, useState } from 'react'
import s from '../landing.module.css'

// Scroll-driven product demo from design/landing-final.html. Illustrative data
// (demo persona), not clickable. Plays once when the window enters the viewport,
// with the reference's timings.

type Flag =
  | 'win' | 'greeting' | 'stats' | 'pick' | 'chip1' | 'chip2' | 'prep' | 'shortlist'
  | 'apps' | 'tag1' | 'tag2' | 'activity' | 'act1' | 'act2' | 'act3'

const TIMELINE: [number, Flag][] = [
  [0, 'win'], [600, 'greeting'], [900, 'stats'], [1600, 'pick'], [2000, 'shortlist'],
  [2200, 'apps'], [2400, 'chip1'], [2600, 'activity'], [2900, 'chip2'], [3000, 'act1'],
  [3400, 'prep'], [3400, 'act2'], [3600, 'tag1'], [3800, 'act3'], [4000, 'tag2'],
]

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning, John.'
  if (hour >= 12 && hour < 18) return 'Good afternoon, John.'
  return 'Good evening, John.'
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

type DemoBrand = 'kiteframe' | 'northlane' | 'brightform' | 'signalnest' | 'asterwell'

const DEMO_BRANDS: Record<DemoBrand, { name: string; background: string; accent: string }> = {
  kiteframe: { name: 'Kiteframe Labs', background: '#172554', accent: '#93C5FD' },
  northlane: { name: 'Northlane Systems', background: '#3F1D52', accent: '#E9D5FF' },
  brightform: { name: 'Brightform Cloud', background: '#713F12', accent: '#FDE68A' },
  signalnest: { name: 'Signalnest AI', background: '#064E3B', accent: '#A7F3D0' },
  asterwell: { name: 'Asterwell Studio', background: '#7F1D1D', accent: '#FECACA' },
}

function DemoLogo({ brand, className }: { brand: DemoBrand; className: string }) {
  const company = DEMO_BRANDS[brand]
  return (
    <span className={className} style={{ background: company.background }} aria-hidden="true">
      <svg width="70%" height="70%" viewBox="0 0 32 32" fill="none">
        {brand === 'kiteframe' && (
          <>
            <path d="M8 7h8l8 9-8 9H8l8-9L8 7Z" fill={company.accent} />
            <path d="m8 7 8 9-8 9" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
          </>
        )}
        {brand === 'northlane' && (
          <>
            <path d="M7 24 16 6l9 18-9-5-9 5Z" fill={company.accent} />
            <path d="M16 6v13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}
        {brand === 'brightform' && (
          <>
            <circle cx="16" cy="16" r="6" fill="#fff" />
            <path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l3 3M21.5 21.5l3 3M24.5 7.5l-3 3M10.5 21.5l-3 3" stroke={company.accent} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
        {brand === 'signalnest' && (
          <>
            <circle cx="16" cy="16" r="3" fill="#fff" />
            <path d="M10.5 21.5a7.8 7.8 0 0 1 0-11M21.5 10.5a7.8 7.8 0 0 1 0 11M7 25a12.7 12.7 0 0 1 0-18M25 7a12.7 12.7 0 0 1 0 18" stroke={company.accent} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}
        {brand === 'asterwell' && (
          <path d="m16 4 2.7 8.2L27 15l-8.3 2.8L16 26l-2.7-8.2L5 15l8.3-2.8L16 4Z" fill={company.accent} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  )
}

export function ProductDemo() {
  const winRef = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState<Set<Flag>>(new Set())
  const [greeting, setGreeting] = useState('Good morning, John.')
  const [counts, setCounts] = useState({ reviewed: 0, shortlisted: 0, ready: 0 })

  useEffect(() => {
    const win = winRef.current
    if (!win) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const frames: number[] = []

    function countUp(key: keyof typeof counts, target: number, ms: number) {
      const start = performance.now()
      const frame = (now: number) => {
        const p = Math.min((now - start) / ms, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setCounts(c => ({ ...c, [key]: Math.round(eased * target) }))
        if (p < 1) frames.push(requestAnimationFrame(frame))
      }
      frames.push(requestAnimationFrame(frame))
    }

    function play() {
      setGreeting(greetingFor(new Date().getHours()))
      for (const [at, flag] of TIMELINE) {
        timers.push(setTimeout(() => setOn(prev => new Set(prev).add(flag)), at))
      }
      timers.push(setTimeout(() => countUp('reviewed', 2143, 1800), 900))
      timers.push(setTimeout(() => countUp('shortlisted', 6, 600), 2700))
      timers.push(setTimeout(() => countUp('ready', 2, 500), 3300))
    }

    const obs = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          play()
          obs.disconnect()
        }
      },
      { threshold: 0.05 },
    )
    obs.observe(win)
    return () => {
      obs.disconnect()
      timers.forEach(clearTimeout)
      frames.forEach(cancelAnimationFrame)
    }
  }, [])

  const has = (f: Flag) => on.has(f)
  const pop = (f: Flag, slow = false) => `${slow ? s.popSlow : s.pop} ${has(f) ? s.popIn : ''}`
  const fade = (f: Flag, cls: string) => `${cls} ${has(f) ? s.fadeIn : ''}`

  return (
    <div className={s.demoStage}>
      <div ref={winRef} className={`${s.demoWin} ${has('win') ? s.demoWinIn : ''}`} aria-label="Illustrative Careerely dashboard demo with fictional companies and roles" role="img">
        {/* Browser chrome */}
        <div className={s.chrome}>
          <div className={s.light} style={{ background: '#FF5F57' }} />
          <div className={s.light} style={{ background: '#FEBC2E' }} />
          <div className={s.light} style={{ background: '#28C840' }} />
          <div className={s.urlBar}>
            <span>careerely.ai/dashboard</span>
          </div>
        </div>

        {/* App nav */}
        <div className={s.appNav}>
          <div className={s.appBrand}>
            <div className={s.appMark}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
              </svg>
            </div>
            <span className={s.appWord}>
              Career<span>ely</span>
            </span>
          </div>
          <div className={s.appSep} />
          <div className={s.scan}>
            <div className={s.scanDot} />
            <span>Scanning the market...</span>
          </div>
          <div className={s.demoBadge}>Illustrative demo</div>
          <div className={s.appTabs}>
            <div className={`${s.appTab} ${s.appTabOn}`}>Dashboard</div>
            <div className={s.appTab}>Opportunities</div>
            <div className={s.appTab}>Applications</div>
          </div>
          <div className={s.avatar}>JM</div>
        </div>

        {/* App body */}
        <div className={s.appBody}>
          <div>
            <div className={`${s.greeting} ${pop('greeting')}`}>
              <div className={s.greetTime}>{greeting}</div>
              <div className={s.greetEyebrow}>My pick</div>
              <div className={s.greetTitle}>I&apos;d start here.</div>
            </div>

            <div className={`${s.stats} ${pop('stats')}`}>
              <div>
                <strong>{counts.reviewed.toLocaleString('en-US')}</strong> reviewed
              </div>
              <span className={s.statsDot}>·</span>
              <div>
                <strong>{counts.shortlisted}</strong> shortlisted
              </div>
              <span className={s.statsDot}>·</span>
              <div>
                <strong>{counts.ready}</strong> applications ready
              </div>
            </div>

            <div className={`${s.card} ${s.pick} ${s.popSlow} ${has('pick') ? s.popIn : ''}`}>
              <div className={s.pickGrid}>
                <div className={s.pickMain}>
                  <div className={s.pickHead}>
                    <DemoLogo brand="kiteframe" className={s.pickLogo} />
                    <div>
                      <div className={s.pickRole}>Growth Marketing Lead</div>
                      <div className={s.pickMeta}>Kiteframe Labs · London · Hybrid</div>
                    </div>
                  </div>
                  <div className={s.chips}>
                    <span className={s.chipMatch}>96% match</span>
                    <span className={`${s.chipEvidence} ${fade('chip1', s.fade)}`}>✓ 6 years in B2B SaaS</span>
                    <span className={`${s.chipEvidence} ${fade('chip2', s.fade)}`}>✓ Demand generation &amp; lifecycle</span>
                  </div>
                </div>
                <div className={s.pickSide}>
                  <div className={s.pickReason}>
                    Your six years in B2B SaaS marketing, ownership of multi-channel demand generation, and track record growing qualified pipeline directly match this role.
                  </div>
                  <div className={fade('prep', s.fadeSlow)}>
                    <div className={s.prepLine}>
                      <Check size={10} />
                      Resume tailored
                    </div>
                    <div className={`${s.prepLine} ${s.prepLineLast}`}>
                      <Check size={10} />
                      Cover letter drafted
                    </div>
                    <div className={s.prepBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      Review application
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${s.card} ${s.shortlist} ${pop('shortlist', true)}`}>
              <div className={s.cardHead}>
                <span className={s.cardTitle}>Your shortlist</span>
                <span className={s.cardMeta}>View all (6)</span>
              </div>
              <div className={s.row}>
                <DemoLogo brand="northlane" className={s.rowLogo} />
                <div className={s.rowText}>
                  Senior Growth Marketing Manager <span>· Northlane Systems</span>
                </div>
                <span className={s.rowPct}>93%</span>
              </div>
              <div className={s.row}>
                <DemoLogo brand="brightform" className={s.rowLogo} />
                <div className={s.rowText}>
                  Demand Generation Lead <span>· Brightform Cloud</span>
                </div>
                <span className={s.rowPct}>91%</span>
              </div>
            </div>
          </div>

          <div className={s.rightCol}>
            <div className={`${s.card} ${pop('apps', true)}`}>
              <div className={`${s.cardHead} ${s.appsHead}`}>
                <span className={`${s.cardTitle} ${s.appsTitle}`}>Applications ready</span>
                <span className={s.readyBadge}>2 READY</span>
              </div>
              <div className={s.appRow}>
                <DemoLogo brand="signalnest" className={s.rowLogo} />
                <div>
                  <div className={s.appRole}>Product Marketing Manager</div>
                  <div className={s.appCompany}>Signalnest AI</div>
                  <div className={`${s.readyTag} ${fade('tag1', s.fade)}`}>
                    <Check size={8} />
                    Ready
                  </div>
                </div>
              </div>
              <div className={s.appRow}>
                <DemoLogo brand="asterwell" className={s.rowLogo} />
                <div>
                  <div className={s.appRole}>Regional Marketing Manager</div>
                  <div className={s.appCompany}>Asterwell Studio</div>
                  <div className={`${s.readyTag} ${fade('tag2', s.fade)}`}>
                    <Check size={8} />
                    Ready
                  </div>
                </div>
              </div>
            </div>

            <div className={`${s.card} ${s.activity} ${pop('activity', true)}`}>
              <div className={s.activityTitle}>Recent activity</div>
              <div className={`${s.act} ${fade('act1', s.fadeQuick)}`}>
                <div className={s.actIcon}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div className={s.actText}>
                  Reviewed <strong>2,143</strong> new postings
                </div>
              </div>
              <div className={`${s.act} ${fade('act2', s.fadeQuick)}`}>
                <div className={s.actIcon}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12" />
                  </svg>
                </div>
                <div className={s.actText}>
                  Shortlisted <strong>6</strong> opportunities
                </div>
              </div>
              <div className={`${s.act} ${fade('act3', s.fadeQuick)}`}>
                <div className={s.actIcon}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  </svg>
                </div>
                <div className={s.actText}>
                  Prepared <strong>2</strong> applications
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
