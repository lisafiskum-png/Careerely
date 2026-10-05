import Image from 'next/image'
import { logoTile } from '../lib/display'

// Bundled brand assets: no external image service or browser tracking request.
const LOGOS: Record<string, string> = {
  stripe: 'stripe', shopify: 'shopify', snowflake: 'snowflake',
  databricks: 'databricks', nubank: 'nubank', adyen: 'adyen',
  brex: 'brex', coinbase: 'coinbase', gitlab: 'gitlab', ripple: 'ripple',
}

export function CompanyLogo({ company, className, size = 34 }: {
  company: string; className?: string; size?: number
}) {
  const logo = LOGOS[company.trim().toLowerCase()]
  const tile = logoTile(company)
  return (
    <span className={className} style={{
      background: logo ? '#fff' : tile.color, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
    }} aria-hidden="true">
      {logo ? <Image src={`/company-logos/${logo}.svg`} alt="" width={size} height={size}
        style={{ width: '70%', height: '70%', objectFit: 'contain' }} /> : tile.letter}
    </span>
  )
}
