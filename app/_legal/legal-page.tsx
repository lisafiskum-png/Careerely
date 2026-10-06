import Link from 'next/link'
import { Fragment } from 'react'
import type { LegalDoc } from '../../lib/legal'
import s from '../legal.module.css'

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>,
  )
}

export function LegalPage({ document }: { document: LegalDoc }) {
  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link href="/" className={s.logo} aria-label="Careerely home">
          Career<span>ely</span>
        </Link>
        <Link href="/" className={s.back}>Back to Careerely</Link>
      </header>
      <article className={s.document}>
        <h1>{document.title}</h1>
        <p className={s.updated}>{document.updated}</p>
        {document.blocks.map((block, index) => (
          <section key={index}>
            {block.heading && <h2>{block.heading}</h2>}
            {block.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex}><Rich text={paragraph} /></p>
            ))}
          </section>
        ))}
      </article>
    </main>
  )
}
