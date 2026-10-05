import { CompanyLogo } from '../../../components/company-logo'

export function LogoTile({ company, letter, color, size }: { company?: string; letter: string; color: string; size: 34 | 44 | 48 }) {
  if (company) return <CompanyLogo company={company} className={`logo logo-${size}`} size={size} />
  return (
    <span className={`logo logo-${size}`} style={{ background: color }} aria-hidden>
      {letter}
    </span>
  )
}
