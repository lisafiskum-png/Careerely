import s from '../landing.module.css'
import { PLAN_LIMITS } from '../../lib/plans'

const QUESTIONS = [
  { question: 'How does Careerely work?', answer: 'Create an account, upload your resume, and tell us which roles and locations you’re interested in. Careerely finds and ranks relevant opportunities and prepares tailored applications for your strongest matches.' },
  { question: 'Does Careerely apply for jobs on my behalf?', answer: 'You stay in control. Careerely prepares your resume and cover letter, but you review the documents and submit the application yourself.' },
  { question: 'Will Careerely add experience or skills to my resume?', answer: 'Tailoring uses the experience and skills already in your resume. Careerely can reword and highlight relevant information, and you can review the changes before using the documents.' },
  { question: 'What is included in each plan?', answer: `Basic includes ${PLAN_LIMITS.basic.activeSearches} active search and ${PLAN_LIMITS.basic.monthlyPreparations} prepared applications per month. Pro includes ${PLAN_LIMITS.pro.activeSearches} active searches and ${PLAN_LIMITS.pro.monthlyPreparations} prepared applications. Max includes unlimited active searches and ${PLAN_LIMITS.max.monthlyPreparations} prepared applications per month.` },
  { question: 'Can I cancel my subscription?', answer: 'Yes. You can manage or cancel your subscription from Settings. When you cancel at the end of your billing period, your access continues until that period ends.' },
  { question: 'Can Careerely guarantee that I’ll get a job?', answer: 'No service can guarantee an offer. Careerely helps you discover relevant roles and prepare applications; employers decide who to interview and hire.' },
]

export function Faq() {
  return <section id="faq" className={s.faq} aria-labelledby="faq-title">
    <div className={s.wrap}>
      <p className={s.eyebrow}>A few things you might be wondering</p>
      <h2 id="faq-title" className={s.h2}>Frequently asked questions</h2>
      <div className={s.faqList}>
        {QUESTIONS.map(item => <details key={item.question} className={s.faqItem}>
          <summary>{item.question}<span aria-hidden="true">+</span></summary>
          <p>{item.answer}</p>
        </details>)}
      </div>
    </div>
  </section>
}
