import type { Metadata } from 'next'
import Link from 'next/link'
import { PLAN_LIMITS, PLANS, type PlanId } from '../lib/plans'
import { ProductDemo } from './_landing/demo'
import { JoinForm } from './_landing/join-form'
import { LandingNav } from './_landing/nav'
import { Faq } from './_landing/faq'
import { SocialLinks } from './_landing/social-links'
import { Reveal, RevealGroup } from './_landing/reveal'
import s from './landing.module.css'

export const metadata: Metadata = {
  title: 'Careerely',
  description: 'Upload your resume once. Careerely continuously finds relevant jobs, tailors your resume, and writes your cover letter.',
}

export const viewport = { themeColor: '#FAFAFA' }

const PLAN_COPY: Record<PlanId, { desc: string }> = {
  basic: { desc: 'For a focused search' },
  pro: { desc: 'For an active job search' },
  max: { desc: 'For an intensive search' },
}

function searchesLabel(limit: number | null) {
  if (limit === null) return 'Unlimited searches'
  return `${limit} active ${limit === 1 ? 'search' : 'searches'}`
}

export default function Home() {
  return (
    <div className={s.page}>
      <noscript>
        <style>{`.${s.reveal},.${s.pop},.${s.popSlow},.${s.fade},.${s.fadeSlow},.${s.fadeQuick},.${s.demoWin}{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <LandingNav />

      <section className={s.hero}>
        <div className={s.heroGlowA} />
        <div className={s.heroGlowB} />
        <div className={`${s.wrap} ${s.heroInner}`}>
          <div className={s.heroBox}>
            <h1 className={s.h1}>
              Career growth,
              <br />
              powered by AI
            </h1>
            <p className={s.lead}>
              Careerely helps ambitious professionals discover opportunities across industries, tailor applications, and land roles at great companies worldwide.
            </p>
            <JoinForm className={s.joinrow} />
          </div>
        </div>
      </section>

      <section id="demo" className={s.demo}>
        <Reveal className={`${s.wrap} ${s.demoIntro}`}>
          <p className={s.demoEyebrow}>Live product demo</p>
          <h2 className={`${s.h2} ${s.demoTitle}`}>This is what Careerely does around the clock.</h2>
          <p className={s.demoNote}>Illustrative profile, companies and roles created to demonstrate the product.</p>
        </Reveal>
        <ProductDemo />
      </section>

      <section id="how" className={s.section}>
        <div className={s.wrap}>
          <Reveal>
            <p className={s.eyebrow}>How it works</p>
            <h2 className={`${s.h2} ${s.howH2}`}>Three steps</h2>
          </Reveal>
          <RevealGroup className={s.steps} stagger={140}>
            <div>
              <span className={s.num}>1</span>
              <h3 className={s.stepTitle}>Upload your resume</h3>
              <p className={s.stepText}>Upload your resume once and tell us what roles you&apos;re targeting.</p>
            </div>
            <div>
              <span className={s.num}>2</span>
              <h3 className={s.stepTitle}>We find your opportunities</h3>
              <p className={s.stepText}>
                Careerely continuously searches for relevant roles based on your skills, experience, and preferences.
              </p>
            </div>
            <div>
              <span className={s.num}>3</span>
              <h3 className={s.stepTitle}>Review tailored applications</h3>
              <p className={s.stepText}>
                For every shortlisted role, Careerely tailors your resume and generates a personalized cover letter based on the job
                description. You review everything before applying.
              </p>
            </div>
          </RevealGroup>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.h2} ${s.whyH2}`}>Not another job board.</h2>
          </Reveal>
          <RevealGroup className={s.whyGrid} stagger={120}>
            <div className={s.whyRow}>
              <div className={s.whyN}>24/7</div>
              <div>
                <div className={s.whyTitle}>Always looking for what&apos;s new</div>
                <div className={s.whyBody}>
                  Careerely continuously checks new listings against your experience and goals, so strong new opportunities can surface as they appear.
                </div>
              </div>
            </div>
            <div className={s.whyRow}>
              <div className={s.whyN}>Ready</div>
              <div>
                <div className={s.whyTitle}>Applications prepared for you</div>
                <div className={s.whyBody}>
                  For your strongest opportunities, your resume and cover letter are already tailored. Read Careerely&apos;s reasoning, review, then apply.
                </div>
              </div>
            </div>
            <div className={s.whyRow}>
              <div className={s.whyN}>Explained</div>
              <div>
                <div className={s.whyTitle}>Reasoning you can check</div>
                <div className={s.whyBody}>
                  Every shortlisted role comes with an explanation. Which requirements you meet, what was changed, and what couldn&apos;t be
                  confirmed.
                </div>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>

      <section id="pricing" className={s.section}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={s.h2}>Pricing</h2>
          </Reveal>
          <RevealGroup className={s.plans} stagger={160}>
            {PLANS.map(plan => {
              const limits = PLAN_LIMITS[plan.id]
              return (
                <div key={plan.id} className={s.planCol}>
                  {plan.featured ? <div className={s.popular}>Most Popular</div> : <div className={s.popularSpacer} />}
                  <div className={`${s.plan} ${plan.featured ? s.planHi : s.planStd}`}>
                    <h3 className={s.planName}>{plan.name}</h3>
                    <p className={s.pdesc}>{PLAN_COPY[plan.id].desc}</p>
                    <div className={s.pprice}>
                      <span className={s.amt}>${plan.monthlyPriceUsd}</span>
                      <span className={s.per}>/mo</span>
                    </div>
                    <p className={s.pvol}>
                      {searchesLabel(limits.activeSearches)}
                      <br />
                      <strong>{limits.monthlyPreparations}</strong> applications prepared monthly
                    </p>
                    <Link href={`/signup?plan=${plan.id}`} className={s.pbtn}>
                      Get Started
                    </Link>
                  </div>
                </div>
              )
            })}
          </RevealGroup>
        </div>
      </section>

      <Faq />

      <footer className={s.footer}>
        <div className={s.wrap}>
          <div className={s.footCta}>
            <div>
              <h2 className={s.footTitle}>Ready to start?</h2>
              <p className={s.footSub}>Upload your resume and let Careerely keep looking</p>
            </div>
            <JoinForm className={s.footForm} />
          </div>
          <div className={s.footBottom}>
            <span className={s.footLogo}>
              Career<span className={s.ely}>ely</span>
            </span>
            <div className={s.footLinks}>
              <a href="#faq">FAQ</a>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
            <SocialLinks />
            <span className={s.footCopy}>© {new Date().getFullYear()} Careerely</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
