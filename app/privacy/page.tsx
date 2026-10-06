import type { Metadata } from 'next'
import { PRIVACY } from '../../lib/legal'
import { LegalPage } from '../_legal/legal-page'

export const metadata: Metadata = { title: 'Privacy Policy — Careerely' }

export default function PrivacyPage() {
  return <LegalPage document={PRIVACY} />
}
