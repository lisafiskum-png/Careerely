import type { Metadata } from 'next'
import { TERMS } from '../../lib/legal'
import { LegalPage } from '../_legal/legal-page'

export const metadata: Metadata = { title: 'Terms of Service — Careerely' }

export default function TermsPage() {
  return <LegalPage document={TERMS} />
}
