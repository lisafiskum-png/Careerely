import s from '../landing.module.css'

const ACCOUNTS = [
  { name: 'LinkedIn', url: process.env.NEXT_PUBLIC_LINKEDIN_URL, icon: 'M6.5 8.5h-3v12h3v-12ZM5 3a1.75 1.75 0 1 0 0 3.5A1.75 1.75 0 0 0 5 3ZM20.5 13.7c0-3.4-1.8-5.1-4.3-5.1-2 0-2.9 1.1-3.4 1.9v-2h-3v12h3v-6.6c0-1.7.8-2.7 2.2-2.7 1.4 0 2.1.9 2.1 2.7v6.6h3.4v-6.8Z' },
  { name: 'Instagram', url: process.env.NEXT_PUBLIC_INSTAGRAM_URL, icon: '' },
  { name: 'Twitter / X', url: process.env.NEXT_PUBLIC_TWITTER_URL, icon: 'M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-7.5L5.3 22H2.1l7.3-8.5L1 2h6.5L12 8.9 18.9 2ZM17.8 20h1.8L6.5 4h-2L17.8 20Z' },
]

function accountUrl(name: string, value?: string) {
  if (!value) return null
  try {
    const url = new URL(value)
    const hosts = name === 'LinkedIn' ? ['linkedin.com', 'www.linkedin.com'] : name === 'Instagram'
      ? ['instagram.com', 'www.instagram.com'] : ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com']
    return url.protocol === 'https:' && hosts.includes(url.hostname) && url.pathname !== '/' ? url.href : null
  } catch { return null }
}

export function SocialLinks() {
  return <div className={s.socialLinks} aria-label="Careerely on social media">
    {ACCOUNTS.map(account => {
      const url = accountUrl(account.name, account.url)
      const icon = <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
        {account.name === 'Instagram' ? <g fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
        </g> : <path d={account.icon} fill="currentColor" />}
      </svg>
      return url ? <a key={account.name} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Careerely on ${account.name}`}>
        {icon}<span>{account.name}</span>
      </a> : <span key={account.name} className={s.socialPending} aria-label={`${account.name} account link coming soon`}>
        {icon}<span>{account.name}</span>
      </span>
    })}
  </div>
}
