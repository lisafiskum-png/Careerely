'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { billingOptions, pricingPlans, type BillingPeriod } from '../lib/plans'

export default function Landing() {
  const router = useRouter()
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('v') }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el))
    return () => { window.removeEventListener('scroll', handleScroll); obs.disconnect() }
  }, [])

  const faqs = [
    { q: 'How does it sound like me and not like AI?', a: "You paste a cover letter you've written before. Careerely analyses your tone, sentence structure, and vocabulary, then writes every new letter in that same voice. It also references the specific requirements from each job posting." },
    { q: "What's the difference between the plans?", a: "Standard gives you voice-matched cover letters, a dashboard, CV review, and a basic ATS score. Pro adds unlimited cover letters, automatic job discovery, one-click apply, AI Career Assistant (10 chats/day), CV builder, and full ATS optimisation with keywords. Premium unlocks unlimited AI chat, interview prep, recruiter outreach drafts, follow-up drafts, dream company monitoring, salary intelligence, application analytics, and ATS optimisation tailored per job." },
    { q: 'What job boards do you scrape?', a: "We scrape all major job boards plus industry-specific ones, including company career pages directly. We're always adding new sources. Job scraping is available on Pro and Premium plans." },
    { q: 'Does it auto-apply for me?', a: "It generates your cover letter, formats the PDF, and opens the application page. You click submit. Most companies have unique forms, and fully automating submissions would hurt your chances." },
    { q: 'Can I use this for any industry?', a: "Yes. Careerely works for any industry. The voice-matched cover letters, AI Career Assistant, application tracking, and interview prep are designed to be universal." },
    { q: 'Can I cancel anytime?', a: "Yes. No contracts. Cancel from your dashboard and keep access until the end of your billing period." },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{
          --bg:#06060b;--surface:#0c0c14;--surface-2:#101018;
          --border:rgba(255,255,255,0.06);--border-h:rgba(255,255,255,0.12);
          --text:#eaeaf0;--text-mid:#9898ad;--text-dim:#64647a;
          --purple:#7c3aed;--purple-l:#a78bfa;
          --gradient:linear-gradient(135deg,#ec4899,#a855f7,#7c3aed);
          --gradient-s:linear-gradient(135deg,rgba(236,72,153,0.07),rgba(168,85,247,0.07),rgba(124,58,237,0.07));
        }
        html{scroll-behavior:smooth}
        body{font-family:'Sora',sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;overflow-x:hidden}
        body::after{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;z-index:9999}
        .reveal{opacity:0;transform:translateY(28px);transition:opacity 0.65s cubic-bezier(0.16,1,0.3,1),transform 0.65s cubic-bezier(0.16,1,0.3,1)}
        .reveal.v{opacity:1;transform:translateY(0)}
        .gr{background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;backdrop-filter:blur(24px) saturate(1.2);background:rgba(6,6,11,0.78);border-bottom:1px solid var(--border)}
        .logo{font-weight:700;font-size:19px;letter-spacing:-0.3px}
        .nr{display:flex;align-items:center;gap:24px}
        .nr a{color:var(--text-dim);text-decoration:none;font-size:13px;font-weight:500;transition:color 0.2s}
        .nr a:hover{color:var(--text)}
        .nav-cta{background:var(--gradient);color:white !important;padding:9px 22px;border-radius:8px;font-weight:600 !important;font-size:13px;text-decoration:none;transition:all 0.25s;box-shadow:0 2px 12px rgba(124,58,237,0.15)}
        .nav-cta:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(124,58,237,0.3) !important}
        .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:140px 24px 80px;position:relative}
        .hero::before{content:'';position:absolute;top:-120px;left:50%;transform:translateX(-50%);width:700px;height:700px;background:radial-gradient(circle,rgba(124,58,237,0.06) 0%,rgba(236,72,153,0.03) 40%,transparent 70%);filter:blur(60px);pointer-events:none}
        h1{font-size:clamp(36px,5.2vw,62px);font-weight:800;line-height:1.08;letter-spacing:-2px;max-width:700px;margin-bottom:20px}
        .hero-sub{font-size:17px;line-height:1.6;color:var(--text-mid);max-width:500px;margin-bottom:36px;font-weight:400}
        .hero-ctas{display:flex;gap:14px;align-items:center;margin-bottom:12px}
        .bp{background:var(--gradient);color:white;padding:13px 30px;border-radius:10px;font-family:'Sora',sans-serif;font-size:14px;font-weight:600;border:none;cursor:pointer;text-decoration:none;display:inline-block;transition:all 0.25s;box-shadow:0 4px 16px rgba(124,58,237,0.2)}
        .bp:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,0.35)}
        .bg2{color:var(--text-mid);padding:13px 30px;border-radius:10px;font-family:'Sora',sans-serif;font-size:14px;font-weight:500;border:1px solid var(--border);background:none;cursor:pointer;text-decoration:none;transition:all 0.2s}
        .bg2:hover{border-color:var(--border-h);color:var(--text);background:rgba(255,255,255,0.02)}
        .hero-note{font-size:12px;color:var(--text-dim)}
        .hero-note strong{color:var(--text-mid)}
        section{padding:100px 24px;max-width:1040px;margin:0 auto}
        .sl{font-size:11px;text-transform:uppercase;letter-spacing:2.5px;color:var(--purple-l);font-weight:600;margin-bottom:14px}
        h2{font-size:clamp(26px,3.8vw,38px);font-weight:700;letter-spacing:-1px;line-height:1.15;margin-bottom:14px}
        .ss{font-size:15px;color:var(--text-dim);max-width:460px;line-height:1.6;margin-bottom:48px}
        .mf{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:52px 48px;overflow:hidden}
        .mf::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:var(--gradient);opacity:0.4}
        .mf p{font-size:16px;color:var(--text-mid);line-height:1.7;max-width:540px}
        .mf p strong{color:var(--text)}
        .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .sc{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px 26px;position:relative;transition:all 0.3s;overflow:hidden}
        .sc:hover{border-color:rgba(124,58,237,0.2);transform:translateY(-3px)}
        .sc::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--gradient);opacity:0;transition:opacity 0.3s}
        .sc:hover::after{opacity:1}
        .sn{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;color:var(--purple-l);letter-spacing:2px;margin-bottom:16px}
        .sc h3{font-size:16px;font-weight:600;margin-bottom:8px}
        .sc p{font-size:13px;color:var(--text-dim);line-height:1.6}
        .mockup-section{padding:0 24px 60px;max-width:940px;margin:0 auto}
        .mockup-label{text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:2.5px;color:var(--purple-l);font-weight:600;margin-bottom:20px}
        .mockup{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35)}
        .mockup-bar{display:flex;align-items:center;gap:7px;padding:11px 16px;background:var(--surface-2);border-bottom:1px solid var(--border)}
        .mockup-dot{width:9px;height:9px;border-radius:50%}
        .mockup-url{margin-left:12px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:5px;padding:4px 14px;font-size:11px;color:var(--text-dim);font-family:'IBM Plex Mono',monospace;flex:1;max-width:280px}
        .mockup-body{padding:20px;display:grid;grid-template-columns:1fr 300px;gap:16px}
        .mock-jobs{display:flex;flex-direction:column;gap:10px}
        .mj{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start}
        .mj:first-child{border-color:rgba(124,58,237,0.2)}
        .mj-title{font-size:13px;font-weight:600;margin-bottom:3px}
        .mj-company{font-size:11px;color:var(--purple-l);margin-bottom:6px}
        .mj-meta{font-size:10px;color:var(--text-dim)}
        .mj-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
        .mj-score{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;padding:3px 8px;border-radius:6px;background:rgba(34,197,94,0.1);color:#22c55e}
        .mj-score-mid{background:rgba(234,179,8,0.1);color:#eab308}
        .mj-btn{font-size:9px;background:var(--gradient);color:white;padding:5px 12px;border-radius:5px;font-weight:600;white-space:nowrap}
        .mock-side{display:flex;flex-direction:column;gap:10px}
        .ms-card{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px}
        .ms-title{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
        .ms-num{font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:500;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .ms-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .ms-cl-title{font-size:10px;color:var(--purple-l);margin-bottom:8px;font-weight:600}
        .ms-cl-line{height:5px;background:rgba(255,255,255,0.04);border-radius:3px;margin-bottom:4px}
        .ms-cl-btn{margin-top:8px;font-size:9px;background:var(--gradient);color:white;padding:5px 12px;border-radius:5px;font-weight:600;display:inline-block}
        .ms-chat-title{font-size:10px;color:var(--purple-l);margin-bottom:8px;font-weight:600}
        .ms-bubble{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:10px;color:var(--text-dim);line-height:1.4;margin-bottom:6px}
        .ms-bubble-ai{background:rgba(124,58,237,0.06);border-color:rgba(124,58,237,0.12)}
        .ms-input{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:10px;color:var(--text-dim);margin-top:4px;width:100%}
        .ct{width:100%;border-collapse:collapse}
        .ct th{text-align:left;padding:12px 18px;font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border)}
        .ct th:last-child{background:var(--gradient-s);color:var(--purple-l);border-radius:12px 12px 0 0}
        .ct td{padding:12px 18px;font-size:13.5px;color:var(--text-dim);border-bottom:1px solid var(--border)}
        .ct td:first-child{color:var(--text-mid);font-weight:500}
        .ct td:last-child{background:rgba(124,58,237,0.03)}
        .ct tr:last-child td{border-bottom:none}
        .ct tr:last-child td:last-child{border-radius:0 0 12px 12px}
        .ck{color:var(--purple-l);font-weight:700}
        .cx{opacity:0.4}
        .fg{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .fc{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:26px 22px;transition:all 0.3s}
        .fc:hover{border-color:rgba(124,58,237,0.2)}
        .fi{width:38px;height:38px;border-radius:10px;background:var(--gradient-s);display:flex;align-items:center;justify-content:center;font-size:17px;margin-bottom:14px;border:1px solid rgba(124,58,237,0.1)}
        .fc h3{font-size:14px;font-weight:600;margin-bottom:6px}
        .fc p{font-size:12.5px;color:var(--text-dim);line-height:1.55}
        .ph{text-align:center;margin-bottom:48px}
        .bt{display:inline-flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:4px;margin-top:20px}
        .bo{padding:8px 20px;border-radius:100px;font-size:13px;font-weight:500;color:var(--text-dim);cursor:pointer;transition:all 0.2s;border:none;background:none;font-family:'Sora',sans-serif}
        .bo.act{background:var(--gradient);color:white}
        .sv{font-size:10px;background:rgba(34,197,94,0.12);color:#22c55e;padding:3px 8px;border-radius:100px;font-weight:600;margin-left:4px}
        .pg{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:1000px;margin:0 auto}
        .pc{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:36px 28px;position:relative;display:flex;flex-direction:column;transition:all 0.3s}
        .pc:hover{border-color:var(--border-h)}
        .pc.ft{border-color:rgba(124,58,237,0.4);background:linear-gradient(180deg,rgba(124,58,237,0.05) 0%,var(--surface) 40%)}
        .pb{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--gradient);color:white;padding:4px 16px;border-radius:100px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;white-space:nowrap}
        .pt{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dim);font-weight:600;margin-bottom:10px}
        .pa{font-size:44px;font-weight:800;letter-spacing:-2px;line-height:1}
        .pa .cu{font-size:20px;font-weight:600;vertical-align:top;margin-right:2px}
        .pp{font-size:13px;color:var(--text-dim);margin-top:4px;margin-bottom:20px;min-height:20px}
        .pd{height:1px;background:var(--border);margin-bottom:18px}
        .pf{list-style:none;flex:1;margin-bottom:24px}
        .pf li{font-size:13px;padding:5px 0;display:flex;align-items:flex-start;gap:10px;color:var(--text-dim)}
        .pf li::before{content:'✓';color:var(--purple-l);font-weight:700;font-size:12px;margin-top:2px}
        .pbtn{display:block;width:100%;padding:13px;border-radius:10px;font-family:'Sora',sans-serif;font-size:14px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;transition:all 0.25s;border:none}
        .pbtn-p{background:var(--gradient);color:white;box-shadow:0 2px 12px rgba(124,58,237,0.15)}
        .pbtn-p:hover{box-shadow:0 6px 28px rgba(124,58,237,0.3);transform:translateY(-1px)}
        .pbtn-o{background:transparent;color:var(--text);border:1px solid var(--border) !important}
        .pbtn-o:hover{border-color:rgba(124,58,237,0.3) !important}
        .fq{max-width:620px;margin:0 auto;padding:60px 24px}
        .fq h2{font-size:24px;margin-bottom:24px}
        .fi2{border-bottom:1px solid var(--border);padding:14px 0;cursor:pointer}
        .fqq{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:500;color:var(--text-mid)}
        .ft2{color:var(--text-dim);font-size:16px;transition:transform 0.3s;flex-shrink:0;margin-left:16px}
        .fa{max-height:0;overflow:hidden;transition:max-height 0.35s ease;font-size:13px;color:var(--text-dim);line-height:1.65}
        .fi2.open .fa{max-height:250px;padding-top:10px}
        .fi2.open .ft2{transform:rotate(45deg)}
        .fi2.open .fqq{color:var(--text)}
        .cta{text-align:center;padding:80px 24px 60px;position:relative}
        .cta::before{content:'';position:absolute;bottom:-60px;left:50%;transform:translateX(-50%);width:500px;height:500px;background:radial-gradient(circle,rgba(124,58,237,0.05) 0%,transparent 70%);filter:blur(60px);pointer-events:none}
        .cta h2{margin-bottom:14px}
        .cta p{font-size:15px;color:var(--text-dim);margin-bottom:32px;max-width:400px;margin-left:auto;margin-right:auto}
        footer{border-top:1px solid var(--border);padding:28px 40px;display:flex;justify-content:space-between;align-items:center;max-width:1040px;margin:0 auto}
        footer p{font-size:12px;color:var(--text-dim)}
        footer a{color:var(--text-dim);text-decoration:none;font-size:12px;margin-left:20px}
        footer a:hover{color:var(--text-mid)}
      `}</style>

      {/* Nav */}
      <nav>
        <div className="logo">Career<span className="gr">ely</span></div>
        <div className="nr">
          <a href="#how">How It Works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#pricing" className="nav-cta">Start Free Trial</a>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <h1>Stop writing applications.<br /><span className="gr">Start landing jobs.</span></h1>
        <p className="hero-sub">One tailored application outperforms a hundred generic ones. Careerely writes cover letters that sound like you, not like AI.</p>
        <div className="hero-ctas">
          <button onClick={() => router.push('/auth')} className="bp">Start Free Trial</button>
          <a href="#how" className="bg2">See How It Works</a>
        </div>
        <p className="hero-note">7-day free trial. Plans from <strong>$29/mo</strong></p>
      </div>

      {/* Manifesto */}
      <section>
        <div className="mf reveal">
          <div className="sl">Our Approach</div>
          <p>Most job tools help you send more applications. We help you send <strong>better</strong> ones.</p>
          <p style={{ fontSize: 22, fontWeight: 600, color: '#eaeaf0', lineHeight: 1.35, margin: '24px 0', maxWidth: 520, letterSpacing: -0.5 }}>
            Every cover letter reads like <em style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontStyle: 'normal' }}>you wrote it yourself</em>.
          </p>
          <p>Paste a cover letter you've written before. Careerely learns your voice and writes every new cover letter in that same voice, tailored to each job's specific requirements. Hiring managers can't tell the difference.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <div className="reveal">
          <div className="sl">How It Works</div>
          <h2>Three steps to your next job offer</h2>
        </div>
        <div className="steps">
          <div className="sc reveal">
            <div className="sn">01</div>
            <h3>Tell us about yourself</h3>
            <p>Your experience, your target roles, and a cover letter you've written before. Careerely learns your voice from a real application. Takes five minutes.</p>
          </div>
          <div className="sc reveal">
            <div className="sn">02</div>
            <h3>Find a job you want</h3>
            <p>Paste any job URL or let Careerely discover matches for you. Every role is scored against your profile before you see it.</p>
          </div>
          <div className="sc reveal">
            <div className="sn">03</div>
            <h3>Apply in under two minutes</h3>
            <p>Click apply. Your cover letter is written in your voice, tailored to the job. PDF downloaded. Application sent. Done.</p>
          </div>
        </div>
      </section>

      {/* Mockup */}
      <div className="mockup-section reveal">
        <div className="mockup-label">Your Dashboard</div>
        <div className="mockup">
          <div className="mockup-bar">
            <div className="mockup-dot" style={{ background: '#ef4444' }}></div>
            <div className="mockup-dot" style={{ background: '#eab308' }}></div>
            <div className="mockup-dot" style={{ background: '#22c55e' }}></div>
            <div className="mockup-url">careerely.ai/dashboard</div>
          </div>
          <div className="mockup-body">
            <div className="mock-jobs">
              <div className="mj">
                <div>
                  <div className="mj-title">Business Development Manager</div>
                  <div className="mj-company">Company A</div>
                  <div className="mj-meta">Remote · $120k–$160k · 2 hours ago</div>
                </div>
                <div className="mj-right">
                  <div className="mj-score">9/10</div>
                  <div className="mj-btn">One-Click Apply</div>
                </div>
              </div>
              <div className="mj">
                <div>
                  <div className="mj-title">Partnerships Lead</div>
                  <div className="mj-company">Company B</div>
                  <div className="mj-meta">London · $140k–$180k · 5 hours ago</div>
                </div>
                <div className="mj-right">
                  <div className="mj-score">8/10</div>
                  <div className="mj-btn">One-Click Apply</div>
                </div>
              </div>
              <div className="mj">
                <div>
                  <div className="mj-title">Sales Manager, Enterprise</div>
                  <div className="mj-company">Company C</div>
                  <div className="mj-meta">New York · $130k–$170k · 1 day ago</div>
                </div>
                <div className="mj-right">
                  <div className="mj-score mj-score-mid">6/10</div>
                  <div className="mj-btn">One-Click Apply</div>
                </div>
              </div>
            </div>
            <div className="mock-side">
              <div className="ms-row">
                <div className="ms-card">
                  <div className="ms-title">Applications</div>
                  <div className="ms-num">24</div>
                </div>
                <div className="ms-card">
                  <div className="ms-title">Interviews</div>
                  <div className="ms-num">7</div>
                </div>
              </div>
              <div className="ms-card">
                <div className="ms-cl-title">Cover Letter Preview</div>
                {[95, 85, 90, 75, 88, 55].map((w, i) => (
                  <div key={i} className="ms-cl-line" style={{ width: `${w}%` }}></div>
                ))}
                <div className="ms-cl-btn">Download PDF</div>
              </div>
              <div className="ms-card">
                <div className="ms-chat-title">AI Career Assistant</div>
                <div className="ms-bubble">How should I answer "why are you leaving your current role?"</div>
                <div className="ms-bubble ms-bubble-ai">Focus on what you're moving toward, not what you're leaving. Frame it around growth...</div>
                <div className="ms-input">Ask anything...</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison */}
      <section>
        <div className="reveal">
          <div className="sl">Why Careerely</div>
          <h2>Quality beats volume</h2>
          <p className="ss">Every feature is built to make each application stronger, not to send more of them.</p>
        </div>
        <table className="ct reveal">
          <thead>
            <tr>
              <th></th>
              <th>On Your Own</th>
              <th>ChatGPT</th>
              <th>Careerely</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Time per application</td><td>2–3 hours</td><td>10–15 min</td><td className="ck">&lt;2 min</td></tr>
            <tr><td>Sounds like you</td><td className="ck">✓</td><td className="cx">✗</td><td className="ck">✓</td></tr>
            <tr><td>References job requirements</td><td className="ck">✓</td><td className="cx">Sometimes</td><td className="ck">Always</td></tr>
            <tr><td>Finds jobs for you</td><td className="cx">✗</td><td className="cx">✗</td><td className="ck">✓</td></tr>
            <tr><td>Scores job fit</td><td className="cx">✗</td><td className="cx">✗</td><td className="ck">✓</td></tr>
            <tr><td>Tracks applications</td><td>Spreadsheet</td><td className="cx">✗</td><td className="ck">Built-in</td></tr>
            <tr><td>Interview prep</td><td className="cx">✗</td><td>Generic</td><td className="ck">Role-specific</td></tr>
          </tbody>
        </table>
      </section>

      {/* Features */}
      <section id="features">
        <div className="reveal">
          <div className="sl">Features</div>
          <h2>Built to get you hired.</h2>
        </div>
        <div className="fg">
          {[
            { icon: '✍️', title: 'Your Voice, Every Time', desc: "Paste a cover letter you've written before. Careerely learns your tone and writes every new letter the same way. Not generic AI. You." },
            { icon: '🚀', title: 'One-Click Apply', desc: 'Tailored cover letter generated, PDF downloaded, job page opened. One click. Under two minutes.' },
            { icon: '🔍', title: 'Job Discovery', desc: 'Job boards and career pages scanned continuously. Every match scored and ranked. Dream company alerts when roles open.' },
            { icon: '💬', title: 'AI Career Assistant', desc: 'Chat with an AI that knows your profile. Interview answers, salary negotiation, follow-up emails, recruiter messages. On demand.' },
            { icon: '🎯', title: 'Interview Prep', desc: "Land an interview? Get a custom prep sheet with likely questions, strong answers from your experience, and smart questions to ask." },
            { icon: '📄', title: 'CV Builder', desc: 'Build a CV from scratch or upload yours and let Careerely improve it. Download as a clean PDF anytime.' },
            { icon: '✅', title: 'ATS Optimisation', desc: 'Get past the filters. Careerely scores your CV against applicant tracking systems and tells you exactly what to fix.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="fc reveal">
              <div className="fi">{icon}</div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing">
        <div className="ph reveal">
          <div className="sl">Pricing</div>
          <h2>Pick your plan. Land your job.</h2>
          <div className="bt">
            {(Object.entries(billingOptions) as Array<[BillingPeriod, typeof billingOptions[BillingPeriod]]>).map(([period, option]) => (
              <button
                key={period}
                className={`bo ${billing === period ? 'act' : ''}`}
                onClick={() => setBilling(period)}
              >
                {option.label}
                {option.discountLabel ? <span className="sv">{option.discountLabel}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="pg">
          {pricingPlans.map(plan => {
            const amount = billing === 'annual' ? plan.annual : plan.monthly
            return (
              <div key={plan.id} className={`pc reveal ${plan.highlight ? 'ft' : ''}`}>
                {plan.highlight ? <div className="pb">Most Popular</div> : null}
                <div className="pt">{plan.title}</div>
                <div className="pa"><span className="cu">$</span>{amount}</div>
                <div className="pp">{billingOptions[billing].priceLabel}</div>
                <div className="pd"></div>
                <p style={{ fontSize: 13.5, color: '#9898ad', marginBottom: 20, lineHeight: 1.4 }}>{plan.tagline}</p>
                <ul className="pf">
                  {plan.features.map(feature => <li key={feature}>{feature}</li>)}
                </ul>
                <button onClick={() => router.push(`/auth?plan=${plan.id}&billing=${billing}`)} className={`pbtn ${plan.highlight ? 'pbtn-p' : 'pbtn-o'}`}>
                  Start 7-Day Free Trial
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* FAQ */}
      <div className="fq" id="faq">
        <div className="reveal"><h2>FAQ</h2></div>
        {faqs.map((faq, i) => (
          <div key={i} className={`fi2 reveal ${openFaq === i ? 'open' : ''}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
            <div className="fqq">{faq.q} <span className="ft2">+</span></div>
            <div className="fa">{faq.a}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="cta reveal">
        <h2>Your next job is<br />one click away.</h2>
        <p>Stop spending hours on applications. Let Careerely do the work.</p>
        <button onClick={() => router.push('/auth')} className="bp">Start Free Trial</button>
      </div>

      {/* Footer */}
      <footer>
        <p>© 2026 Careerely. All rights reserved.</p>
        <div>
          <a href="#">Twitter</a>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </footer>
    </>
  )
}
