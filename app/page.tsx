'use client'
import { useEffect, useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useRouter } from 'next/navigation'

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8 }}
    >
      {children}
    </motion.section>
  )
}

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [ctaEmail, setCtaEmail] = useState('')
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[#FAFAFA]">

      {/* ── NAVIGATION ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? 'bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-zinc-200/60' : ''
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
          <div className="text-[22px] font-semibold tracking-[-0.04em]">
            <span className="text-[#0A0A0A]">Career</span>
            <span className="text-[#6D28D9]">ely</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <a href="#how"      className="text-[14px] text-zinc-500 hover:text-[#0A0A0A] transition-colors duration-200">How it works</a>
            <a href="#features" className="text-[14px] text-zinc-500 hover:text-[#0A0A0A] transition-colors duration-200">Features</a>
            <a href="#pricing"  className="text-[14px] text-zinc-500 hover:text-[#0A0A0A] transition-colors duration-200">Pricing</a>
          </div>

          <button
            onClick={() => router.push('/auth')}
            className="bg-[#0A0A0A] text-white text-[14px] font-medium px-5 py-2.5 rounded-md hover:bg-[#1a1a1a] active:scale-[0.97] transition-all duration-200"
          >
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-40 pb-32 px-6 md:px-12">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1 }}
            className="max-w-[800px]"
          >
            <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-8">
              Invite only
            </p>

            <h1 className="text-[clamp(48px,7vw,88px)] font-semibold text-[#0A0A0A] leading-[1.05] tracking-[-0.035em] mb-8">
              Stop writing applications.{' '}
              <span className="text-[#6D28D9]">Start landing jobs.</span>
            </h1>

            <p className="text-[20px] md:text-[22px] text-zinc-500 leading-[1.6] max-w-[600px] mb-12">
              Careerely learns your voice from one cover letter, scrapes the entire job market, and applies for you. In under 2 minutes.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-[480px] mb-6">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && router.push('/auth')}
                className="flex-1 px-4 py-3.5 rounded-md bg-white border border-zinc-200 text-[#0A0A0A] text-[15px] placeholder:text-zinc-400 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]/20 transition-all"
              />
              <button
                onClick={() => router.push('/auth')}
                className="bg-[#0A0A0A] text-white text-[15px] font-medium px-7 py-3.5 rounded-md hover:bg-[#1a1a1a] active:scale-[0.97] transition-all duration-200 whitespace-nowrap"
              >
                Join Waitlist
              </button>
            </div>

            <p className="text-[13px] text-zinc-400">
              50 spots this week. Founding-member pricing locked in.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ── */}
      <Section className="pb-24 px-6 md:px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-wrap items-center gap-8 md:gap-16 py-8 border-t border-b border-zinc-200/80">
            {[
              { num: '2,847',  label: 'On the waitlist' },
              { num: '94%',    label: 'Interview rate' },
              { num: '<2 min', label: 'Per application' },
              { num: '10x',    label: 'Faster than manual' },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-[28px] md:text-[32px] font-semibold text-[#0A0A0A] tracking-[-0.02em]">{stat.num}</div>
                <div className="text-[13px] text-zinc-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── HOW IT WORKS ── */}
      <Section id="how" className="py-32 px-6 md:px-12">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-4">How it works</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.03em] mb-20 max-w-[600px]">
            Three steps to your next role.
          </h2>

          <div className="grid md:grid-cols-3 gap-0">
            {[
              {
                num: '01',
                title: 'Paste your voice',
                desc: 'Upload a cover letter you have written before. Careerely learns your tone, phrasing, and personality in seconds.',
              },
              {
                num: '02',
                title: 'We find the jobs',
                desc: 'Our scraper searches the entire job market for roles that match your profile. Ranked by fit score.',
              },
              {
                num: '03',
                title: 'Apply automatically',
                desc: 'One click. Tailored cover letter in your voice. Sent. Done. Move on to the next one.',
              },
            ].map((step, i) => (
              <div
                key={i}
                className={`py-10 md:py-0 md:px-10 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-zinc-200' : ''} ${i === 0 ? 'md:pl-0' : ''}`}
              >
                <span className="text-[13px] font-medium text-[#6D28D9] tracking-[0.1em] uppercase">{step.num}</span>
                <h3 className="text-[24px] font-semibold text-[#0A0A0A] tracking-[-0.02em] mt-4 mb-4">{step.title}</h3>
                <p className="text-[16px] text-zinc-500 leading-[1.7]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FEATURES ── */}
      <Section id="features" className="py-32 px-6 md:px-12 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-4">Features</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.03em] mb-20 max-w-[700px]">
            {"Everything you need. Nothing you don't."}
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-zinc-200 border border-zinc-200 rounded-lg overflow-hidden">
            {[
              { title: 'Job Discovery',    desc: 'Scrapes the entire web for roles matching your profile. No more manual searching across 10 different boards.' },
              { title: 'Voice Matching',   desc: 'Paste one cover letter. Every new application sounds exactly like you wrote it yourself.' },
              { title: 'One-Click Apply',  desc: 'Found a role? Apply in one click with a tailored cover letter. Under 2 minutes per application.' },
              { title: 'ATS Optimization', desc: 'Every letter is optimized for applicant tracking systems. Keywords, formatting, structure — handled.' },
              { title: 'CV Builder',       desc: 'Build a CV from scratch or optimize your existing one. Tailored to each role automatically.' },
              { title: 'Interview Prep',   desc: 'AI-generated interview questions based on the exact job description. Practice before you walk in.' },
            ].map((feature, i) => (
              <div key={i} className="bg-white p-10 md:p-12">
                <h3 className="text-[20px] font-semibold text-[#0A0A0A] tracking-[-0.01em] mb-3">{feature.title}</h3>
                <p className="text-[15px] text-zinc-500 leading-[1.7]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── COMPARISON ── */}
      <Section className="py-32 px-6 md:px-12">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-4">Why Careerely</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.03em] mb-20 max-w-[700px]">
            The difference is obvious.
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="py-5 pr-8 text-[14px] font-medium text-zinc-400 uppercase tracking-[0.1em]">Feature</th>
                  <th className="py-5 px-8 text-[14px] font-medium text-zinc-400 uppercase tracking-[0.1em]">On your own</th>
                  <th className="py-5 px-8 text-[14px] font-medium text-zinc-400 uppercase tracking-[0.1em]">ChatGPT</th>
                  <th className="py-5 pl-8 text-[14px] font-medium text-[#6D28D9] uppercase tracking-[0.1em]">Careerely</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Finds jobs for you',   '—',      '—',       '✓'],
                  ['Sounds like you',      '✓',      '—',       '✓'],
                  ['Tailored per job',     'Slow',   'Generic', '✓'],
                  ['One-click apply',      '—',      '—',       '✓'],
                  ['ATS optimized',        '—',      '—',       '✓'],
                  ['Time per application', '45 min', '15 min',  '2 min'],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-5 pr-8 text-[15px] text-[#0A0A0A] font-medium">{row[0]}</td>
                    <td className="py-5 px-8 text-[15px] text-zinc-400">{row[1]}</td>
                    <td className="py-5 px-8 text-[15px] text-zinc-400">{row[2]}</td>
                    <td className="py-5 pl-8 text-[15px] text-[#0A0A0A] font-medium">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── PRICING ── */}
      <Section id="pricing" className="py-32 px-6 md:px-12 bg-white">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-4">Pricing</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.03em] mb-20 max-w-[500px]">
            Simple pricing. No surprises.
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Standard', price: '29', id: 'standard',
                desc: 'For casual job seekers testing the market.',
                features: ['10 cover letters/month', 'Voice matching', 'Job scraping (25 matches/week)', 'Application dashboard', 'PDF download', 'CV review', 'Basic ATS score'],
                highlighted: false,
              },
              {
                name: 'Pro', price: '49', id: 'pro',
                desc: 'For active job seekers ready to move fast.',
                features: ['Unlimited cover letters', 'Real-time job scraping (unlimited)', 'One-click apply', 'Full ATS optimization', 'CV builder from scratch', 'AI career assistant (10/day)', 'Daily email digest'],
                highlighted: true,
              },
              {
                name: 'Premium', price: '79', id: 'premium',
                desc: 'Every advantage unlocked.',
                features: ['Everything in Pro', 'Unlimited AI assistant', 'Interview prep generator', 'Follow-up email drafts', 'Recruiter outreach drafts', 'Dream company monitoring', 'Salary intelligence', 'Weekly market report'],
                highlighted: false,
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`rounded-xl p-8 md:p-10 transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-[#0A0A0A] text-white ring-1 ring-[#0A0A0A]'
                    : 'bg-[#FAFAFA] ring-1 ring-zinc-200'
                }`}
              >
                {plan.highlighted && (
                  <span className="inline-block text-[12px] font-medium text-[#6D28D9] bg-[#6D28D9]/10 px-3 py-1 rounded-full mb-6 border border-[#6D28D9]/20">
                    Most Popular
                  </span>
                )}

                <h3 className={`text-[20px] font-semibold tracking-[-0.01em] mb-2 ${plan.highlighted ? 'text-white' : 'text-[#0A0A0A]'}`}>
                  {plan.name}
                </h3>
                <p className={`text-[14px] mb-6 ${plan.highlighted ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {plan.desc}
                </p>

                <div className="mb-8">
                  <span className={`text-[48px] font-semibold tracking-[-0.03em] ${plan.highlighted ? 'text-white' : 'text-[#0A0A0A]'}`}>
                    ${plan.price}
                  </span>
                  <span className={`text-[15px] ml-1 ${plan.highlighted ? 'text-zinc-400' : 'text-zinc-500'}`}>/mo</span>
                </div>

                <button
                  onClick={() => router.push(`/auth?plan=${plan.id}&billing=monthly`)}
                  className={`w-full py-3 rounded-md text-[14px] font-medium mb-8 transition-all duration-200 active:scale-[0.97] ${
                    plan.highlighted
                      ? 'bg-white text-[#0A0A0A] hover:bg-zinc-100'
                      : 'bg-[#0A0A0A] text-white hover:bg-[#1a1a1a]'
                  }`}
                >
                  Get Started
                </button>

                <div className="space-y-3">
                  {plan.features.map((feature, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <span className="text-[14px] mt-0.5 text-[#6D28D9]">✓</span>
                      <span className={`text-[14px] leading-[1.5] ${plan.highlighted ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section id="faq" className="py-32 px-6 md:px-12">
        <div className="max-w-[700px] mx-auto">
          <p className="text-[14px] font-medium text-zinc-400 uppercase tracking-[0.15em] mb-4">FAQ</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.03em] mb-16">
            Questions.
          </h2>

          <div className="divide-y divide-zinc-200">
            {[
              { q: 'How does voice matching work?',          a: 'You paste a cover letter you have written before. Our AI learns your unique tone, phrasing, and style, then applies it to every new letter. Hiring managers cannot tell the difference.' },
              { q: 'What does the job scraper actually do?', a: 'It searches the entire internet for job postings that match your profile, experience, and preferences. Not just one board — everywhere. Results are ranked by how well they fit you.' },
              { q: 'Can I switch plans later?',              a: 'Yes. Upgrade or downgrade anytime. Changes take effect at your next billing cycle.' },
              { q: 'Is my data secure?',                     a: 'All data is encrypted at rest and in transit. We never share your information with third parties or use it to train models.' },
              { q: 'Why invite only?',                       a: 'We are onboarding users in small batches to ensure quality. Every new member gets a personal onboarding and priority support during early access.' },
              { q: 'What if I do not have a cover letter to paste?', a: 'No problem. You can write a short paragraph about yourself and Careerely will learn from that. Or use our CV builder to create everything from scratch.' },
            ].map((item, i) => (
              <div key={i} className="py-7">
                <h3 className="text-[16px] font-medium text-[#0A0A0A] mb-2">{item.q}</h3>
                <p className="text-[15px] text-zinc-500 leading-[1.7]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FINAL CTA ── */}
      <Section className="py-32 px-6 md:px-12 bg-[#0A0A0A]">
        <div className="max-w-[700px] mx-auto text-center">
          <h2 className="text-[clamp(36px,5vw,56px)] font-semibold text-white leading-[1.1] tracking-[-0.03em] mb-6">
            Your next role is one click away.
          </h2>
          <p className="text-[18px] text-zinc-400 mb-10 leading-[1.6]">
            Join the waitlist. Get early access. Lock in founding-member pricing.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-[420px] mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              value={ctaEmail}
              onChange={e => setCtaEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && router.push('/auth')}
              className="flex-1 px-4 py-3.5 rounded-md bg-white/10 border border-white/20 text-white text-[15px] placeholder:text-zinc-500 focus:outline-none focus:border-[#6D28D9] transition-all"
            />
            <button
              onClick={() => router.push('/auth')}
              className="bg-white text-[#0A0A0A] text-[15px] font-medium px-7 py-3.5 rounded-md hover:bg-zinc-100 active:scale-[0.97] transition-all duration-200 whitespace-nowrap"
            >
              Join Waitlist
            </button>
          </div>
        </div>
      </Section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0A0A0A] border-t border-white/10 py-12 px-6 md:px-12">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-[16px] font-semibold tracking-[-0.02em]">
            <span className="text-white">Career</span>
            <span className="text-[#6D28D9]">ely</span>
          </div>

          <div className="flex items-center gap-8">
            <a href="#" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Twitter</a>
            <a href="#" className="text-[13px] text-zinc-500 hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Instagram</a>
          </div>

          <p className="text-[13px] text-zinc-600">© 2025 Careerely</p>
        </div>
      </footer>

    </div>
  )
}
