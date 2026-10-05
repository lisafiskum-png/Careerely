import Link from 'next/link'
import { SocialLinks } from '../../../components/social-links'

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <Link href="/" className="app-footer-brand" aria-label="Careerely home">
          Career<span>ely</span>
        </Link>
        <nav className="app-footer-links" aria-label="Footer">
          <Link href="/#faq">FAQ</Link>
        </nav>
        <SocialLinks
          className="app-footer-socials"
          linkClassName="app-footer-social"
          pendingClassName="app-footer-social app-footer-social-pending"
        />
        <span className="app-footer-copy">© {new Date().getFullYear()} Careerely</span>
      </div>
    </footer>
  )
}
