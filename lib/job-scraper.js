import { parse } from 'node-html-parser'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function cleanText(text) {
  return (text || '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function absoluteUrl(base, href) {
  try { return new URL(href, base).href } catch { return href }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── query type detection ──────────────────────────────────────────────────────

const CRYPTO_TERMS = [
  'crypto', 'web3', 'blockchain', 'defi', 'nft', 'token', 'bitcoin', 'ethereum',
  'solana', 'polygon', 'wallet', 'exchange', 'dao', 'dex', 'protocol', 'on-chain',
  'onchain', 'layer 2', 'layer2', 'l2', 'staking', 'yield', 'liquidity',
]

const AML_TERMS = [
  'aml', 'kyc', 'kyb', 'anti money laundering', 'compliance', 'financial crime',
  'transaction monitoring', 'due diligence', 'edd', 'cdd', 'mlro', 'sanctions',
  'fraud analyst', 'fraud officer', 'regulatory', 'mica', 'fatf',
]

function isCryptoQuery(q) {
  return CRYPTO_TERMS.some(t => q.includes(t))
}

function isAMLQuery(q) {
  return AML_TERMS.some(t => q.includes(t))
}

// ── scoring (query-based, works for any industry) ─────────────────────────────

function scoreJob(job, queryTerms, locationPref) {
  let score = 5
  const title = (job.title || '').toLowerCase()
  const desc = (job.description || '').toLowerCase()
  const loc = (job.location || '').toLowerCase()

  // Title relevance — most important signal
  const titleMatches = queryTerms.filter(t => title.includes(t)).length
  if (titleMatches >= queryTerms.length && queryTerms.length > 0) score += 3
  else score += Math.min(2, titleMatches)

  // Description depth (means we got real data, not just a title)
  if (desc.length > 200) score += 0.5

  // Location match
  if (locationPref) {
    const pref = locationPref.toLowerCase()
    if (pref.includes('remote')) {
      if (loc.includes('remote') || loc.includes('anywhere') || loc.includes('worldwide')) score += 1.5
    } else if (loc.includes(pref)) {
      score += 1.5
    } else if (loc.includes('remote')) {
      score += 0.5
    }
  } else if (loc.includes('remote')) {
    score += 0.5
  }

  // Salary info
  if (job.salary) score += 0.5

  return Math.min(10, Math.max(1, Math.round(score)))
}

// ── deduplication ─────────────────────────────────────────────────────────────

function dedupeJobs(jobs) {
  const seen = new Set()
  return jobs.filter(job => {
    const titleNorm = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const companyNorm = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = `${titleNorm}__${companyNorm}`
    if (seen.has(key) || !titleNorm) return false
    seen.add(key)
    return true
  })
}

// ── query matching ────────────────────────────────────────────────────────────

function matchesQuery(job, queryTerms) {
  if (!queryTerms.length) return true
  const haystack = `${job.title || ''} ${job.company || ''} ${job.description || ''}`.toLowerCase()
  // At least one term must match (OR logic — stricter AND for title handled in scoring)
  return queryTerms.some(t => haystack.includes(t))
}

// ── ATS API scrapers ──────────────────────────────────────────────────────────
// Companies with public JSON APIs. Much more reliable than HTML scraping.

// General companies (any industry)
const GREENHOUSE_GENERAL = {
  stripe: 'Stripe',
  shopify: 'Shopify',
  airbnb: 'Airbnb',
  figma: 'Figma',
  notion: 'Notion',
  canva: 'Canva',
  hubspot: 'HubSpot',
  zendesk: 'Zendesk',
  twilio: 'Twilio',
  datadoghq: 'Datadog',
  cloudflare: 'Cloudflare',
  hashicorp: 'HashiCorp',
  gitlab: 'GitLab',
  fastly: 'Fastly',
  brex: 'Brex',
  ramp: 'Ramp',
  plaid: 'Plaid',
  gusto: 'Gusto',
  lattice: 'Lattice',
  checkr: 'Checkr',
  adyen: 'Adyen',
  wise: 'Wise',
  n26: 'N26',
  klarna: 'Klarna',
  revolut: 'Revolut',
}

const LEVER_GENERAL = {
  airtable: 'Airtable',
  webflow: 'Webflow',
  loom: 'Loom',
  mercury: 'Mercury',
  rippling: 'Rippling',
  retool: 'Retool',
  linear: 'Linear',
  vercel: 'Vercel',
  tailscale: 'Tailscale',
  deel: 'Deel',
  remote: 'Remote',
  gocardless: 'GoCardless',
  pleo: 'Pleo',
}

const ASHBY_GENERAL = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral AI',
  cohere: 'Cohere',
  anyscale: 'Anyscale',
  modal: 'Modal',
  dbt: 'dbt Labs',
  posthog: 'PostHog',
  plane: 'Plane',
}

// Crypto/Web3 companies — only used when query contains crypto terms
const GREENHOUSE_CRYPTO = {
  coinbase: 'Coinbase',
  gemini: 'Gemini',
  chainalysis: 'Chainalysis',
  fireblocks: 'Fireblocks',
  bitgo: 'BitGo',
  anchorage: 'Anchorage Digital',
  ripple: 'Ripple',
  circle: 'Circle',
  alchemy: 'Alchemy',
  paxos: 'Paxos',
  blockdaemon: 'Blockdaemon',
  uniswaplabs: 'Uniswap',
  opensea: 'OpenSea',
  worldcoin: 'Worldcoin',
  elliptic: 'Elliptic',
  trmlabs: 'TRM Labs',
  consensys: 'ConsenSys',
  kraken: 'Kraken',
  complyadvantage: 'ComplyAdvantage',
  feedzai: 'Feedzai',
  unit21: 'Unit21',
  sumsub: 'Sumsub',
  moonpay: 'MoonPay',
  bitstamp: 'Bitstamp',
  layerzero: 'LayerZero',
  persona: 'Persona',
  alloy: 'Alloy',
  ebury: 'Ebury',
}

const LEVER_CRYPTO = {
  'polygon-technology': 'Polygon',
  dydx: 'dYdX',
  messari: 'Messari',
  'wintermute-trading': 'Wintermute',
  onfido: 'Onfido',
  veriff: 'Veriff',
  nansen: 'Nansen',
  bybit: 'Bybit',
  okx: 'OKX',
}

const ASHBY_CRYPTO = {
  morpho: 'Morpho',
  eigenlayer: 'EigenLayer',
  wormhole: 'Wormhole',
  sardine: 'Sardine',
  hyperliquid: 'Hyperliquid',
  lucinity: 'Lucinity',
}

async function scrapeGreenhouse(slug, companyName, queryTerms) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.jobs || [])
    .filter(j => matchesQuery({ title: j.title, company: companyName, description: '' }, queryTerms))
    .map(j => ({
      title: j.title || '',
      company: companyName,
      location: j.location?.name || '',
      salary: '',
      jobUrl: j.absolute_url || '',
      description: '',
      source: `${companyName} careers`,
    }))
}

async function scrapeLever(slug, companyName, queryTerms) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000)
  if (!res.ok) return []
  const data = await res.json()
  return (Array.isArray(data) ? data : [])
    .filter(j => matchesQuery({ title: j.text, company: companyName, description: j.descriptionPlain || '' }, queryTerms))
    .map(j => ({
      title: j.text || '',
      company: companyName,
      location: j.categories?.location || j.categories?.allLocations?.join(', ') || '',
      salary: '',
      jobUrl: j.hostedUrl || '',
      description: (j.descriptionPlain || '').slice(0, 800),
      source: `${companyName} careers`,
    }))
}

async function scrapeAshby(slug, companyName, queryTerms) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.jobPostings || [])
    .filter(j => matchesQuery({ title: j.title, company: companyName, description: j.descriptionPlain || '' }, queryTerms))
    .map(j => ({
      title: j.title || '',
      company: companyName,
      location: j.locationName || (j.isRemote ? 'Remote' : ''),
      salary: '',
      jobUrl: j.jobUrl || j.applyUrl || '',
      description: (j.descriptionPlain || '').slice(0, 800),
      source: `${companyName} careers`,
    }))
}

async function scrapeAllATS(queryTerms, includeCrypto) {
  const greenhouseCompanies = { ...GREENHOUSE_GENERAL, ...(includeCrypto ? GREENHOUSE_CRYPTO : {}) }
  const leverCompanies = { ...LEVER_GENERAL, ...(includeCrypto ? LEVER_CRYPTO : {}) }
  const ashbyCompanies = { ...ASHBY_GENERAL, ...(includeCrypto ? ASHBY_CRYPTO : {}) }

  const tasks = [
    ...Object.entries(greenhouseCompanies).map(([slug, name]) =>
      scrapeGreenhouse(slug, name, queryTerms).catch(() => [])),
    ...Object.entries(leverCompanies).map(([slug, name]) =>
      scrapeLever(slug, name, queryTerms).catch(() => [])),
    ...Object.entries(ashbyCompanies).map(([slug, name]) =>
      scrapeAshby(slug, name, queryTerms).catch(() => [])),
  ]
  const results = await Promise.allSettled(tasks)
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

// ── general job board scrapers (any industry) ─────────────────────────────────

async function scrapeRemoteOK(query) {
  const tags = query.trim().replace(/\s+/g, '-').toLowerCase()
  const url = `https://remoteok.com/api?tags=${encodeURIComponent(tags)}`
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: 'application/json' } }, 10000)
  if (!res.ok) return []
  const data = await res.json()
  return (Array.isArray(data) ? data : [])
    .filter(j => j.position)
    .map(j => ({
      title: cleanText(j.position || ''),
      company: cleanText(j.company || ''),
      location: j.location || 'Remote',
      salary: j.salary || '',
      jobUrl: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      description: cleanText((j.description || '').replace(/<[^>]+>/g, ' ')).slice(0, 800),
      source: 'RemoteOK',
    }))
    .slice(0, 30)
}

async function scrapeRemotive(query) {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=40`
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: 'application/json' } }, 10000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.jobs || []).map(j => ({
    title: j.title || '',
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    salary: j.salary || '',
    jobUrl: j.url || '',
    description: cleanText((j.description || '').replace(/<[^>]+>/g, ' ')).slice(0, 800),
    source: 'Remotive',
  }))
}

async function scrapeJobicy(query) {
  const tag = encodeURIComponent(query.trim().replace(/\s+/g, '-').toLowerCase())
  const url = `https://jobicy.com/api/v2/remote-jobs?count=40&tag=${tag}`
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: 'application/json' } }, 10000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.jobs || []).map(j => ({
    title: j.jobTitle || '',
    company: j.companyName || '',
    location: j.jobGeo || 'Remote',
    salary: j.annualSalaryMin ? `$${j.annualSalaryMin}–$${j.annualSalaryMax}` : '',
    jobUrl: j.url || '',
    description: cleanText((j.jobExcerpt || j.jobDescription || '').replace(/<[^>]+>/g, ' ')).slice(0, 800),
    source: 'Jobicy',
  }))
}

async function scrapeTheMuse(query) {
  const url = `https://www.themuse.com/api/public/jobs?descriptionFragment=${encodeURIComponent(query)}&page=1`
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: 'application/json' } }, 10000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.results || []).map(j => ({
    title: j.name || '',
    company: j.company?.name || '',
    location: j.locations?.map(l => l.name).join(', ') || '',
    salary: '',
    jobUrl: j.refs?.landing_page || '',
    description: cleanText((j.contents || '').replace(/<[^>]+>/g, ' ')).slice(0, 800),
    source: 'The Muse',
  }))
}

async function scrapeHimalayas(query) {
  const url = `https://himalayas.app/jobs/api?q=${encodeURIComponent(query)}&limit=40`
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: 'application/json' } }, 10000)
  if (!res.ok) return []
  const data = await res.json()
  return (data.jobs || []).map(j => ({
    title: j.title || '',
    company: j.company?.name || j.companyName || '',
    location: j.location || 'Remote',
    salary: j.salary || '',
    jobUrl: j.applicationUrl || j.url || '',
    description: cleanText((j.description || '').replace(/<[^>]+>/g, ' ')).slice(0, 800),
    source: 'Himalayas',
  }))
}

// ── crypto-specific job board scrapers ────────────────────────────────────────
// Only called when the query contains crypto/web3 terms

async function scrapeWeb3Career(query) {
  const jobs = []
  const slug = query.trim().replace(/\s+/g, '-').toLowerCase()
  const pages = [
    `https://web3.career/${encodeURIComponent(slug)}-jobs`,
    'https://web3.career/business-development-jobs',
    'https://web3.career/sales-jobs',
    'https://web3.career/partnerships-jobs',
    'https://web3.career/non-tech-jobs',
  ]

  for (const url of pages) {
    try {
      const res = await fetchWithTimeout(url, { headers: HEADERS }, 10000)
      if (!res.ok) continue
      const html = await res.text()
      const doc = parse(html)

      const rows = doc.querySelectorAll('tr')
      for (const row of rows) {
        const links = row.querySelectorAll('a[href]')
        let jobUrl = '', title = '', company = '', location = '', salary = ''
        for (const link of links) {
          const href = link.getAttribute('href') || ''
          const text = cleanText(link.textContent)
          if (/\/[a-z0-9-]+-[a-z0-9-]+\/\d{4,}/.test(href) && text && text.length > 5) {
            jobUrl = absoluteUrl('https://web3.career', href)
            title = text
          }
        }
        if (!jobUrl || !title) continue
        const rowText = row.textContent
        const salaryMatch = rowText.match(/\$[\d,]+[Kk]?\s*[-–]\s*\$[\d,]+[Kk]?/)
        if (salaryMatch) salary = salaryMatch[0]
        const locMatch = rowText.match(/\b(Remote|New York|London|Singapore|Dubai|Europe|Amsterdam|Berlin|Worldwide)\b/i)
        if (locMatch) location = locMatch[0]
        const companyEl = row.querySelector('h3, [class*="company"]')
        if (companyEl) company = cleanText(companyEl.textContent)
        jobs.push({ title, company, location, salary, jobUrl, description: title, source: 'web3.career' })
      }
    } catch (_) {}
  }
  return jobs
}

async function scrapeCryptoJobsList(query) {
  const jobs = []
  const slug = query.trim().replace(/\s+/g, '-').toLowerCase()
  const urls = [
    `https://cryptojobslist.com/${encodeURIComponent(slug)}`,
    'https://cryptojobslist.com/business-development',
    'https://cryptojobslist.com/sales',
    'https://cryptojobslist.com/non-tech',
    'https://cryptojobslist.com/legal',
  ]

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, { headers: HEADERS }, 10000)
      if (!res.ok) continue
      const html = await res.text()
      const doc = parse(html)
      const links = doc.querySelectorAll('a[href]')
      for (const link of links) {
        const href = link.getAttribute('href') || ''
        if (!href.includes('/job/') && !href.match(/cryptojobslist\.com\/[a-z-]+\/[a-z0-9-]+/)) continue
        const title = cleanText(link.textContent)
        if (!title || title.length < 8 || title.length > 200) continue
        if (['post a job', 'view all', 'sign up', 'log in'].includes(title.toLowerCase())) continue
        const parent = link.closest('div, li, article, section')
        const company = parent ? cleanText(parent.querySelector('[class*="company"], h3')?.textContent || '') : ''
        const location = parent ? cleanText(parent.querySelector('[class*="location"], [class*="remote"]')?.textContent || '') : ''
        jobs.push({ title, company, location, salary: '', jobUrl: absoluteUrl('https://cryptojobslist.com', href), description: title, source: 'CryptoJobsList' })
      }
    } catch (_) {}
  }
  return jobs
}

async function scrapeCryptocurrencyJobs(query) {
  const jobs = []
  for (const cat of ['sales', 'non-tech', 'business-development', 'marketing', 'operations']) {
    try {
      const url = `https://cryptocurrencyjobs.co/${cat}/`
      const res = await fetchWithTimeout(url, { headers: HEADERS }, 10000)
      if (!res.ok) continue
      const html = await res.text()
      const doc = parse(html)
      const cards = doc.querySelectorAll('li, article, [class*="job"]')
      for (const card of cards) {
        for (const link of card.querySelectorAll('a[href]')) {
          const href = link.getAttribute('href') || ''
          if (!href.match(/\/(sales|non-tech|marketing|operations|business-development)\/[^/]+/)) continue
          const title = cleanText(link.textContent || card.querySelector('h2, h3, [class*="title"]')?.textContent || '')
          if (!title || title.length < 8) continue
          const company = cleanText(card.querySelector('h3, [class*="company"]')?.textContent || '')
          const location = cleanText(card.querySelector('[class*="location"]')?.textContent || 'Remote')
          const salaryMatch = card.textContent.match(/[\$£€][\d,]+[Kk]?\s*[-–]\s*[\$£€][\d,]+[Kk]?/)
          jobs.push({ title, company, location, salary: salaryMatch?.[0] || '', jobUrl: absoluteUrl('https://cryptocurrencyjobs.co', href), description: title, source: 'CryptocurrencyJobs' })
          break
        }
      }
    } catch (_) {}
  }
  return jobs
}

// ── Regional job boards ───────────────────────────────────────────────────────

async function scrapeRekrute(query) {
  const url = `https://www.rekrute.com/offres.html?s=1&p=1&q=${encodeURIComponent(query)}`
  const res = await fetchWithTimeout(url, { headers: HEADERS }, 10000)
  if (!res.ok) return []
  const html = await res.text()
  const doc = parse(html)
  const jobs = []
  const links = doc.querySelectorAll('a[href*="/offre-emploi-"]')
  const seen = new Set()
  for (const link of links) {
    const href = link.getAttribute('href') || ''
    if (seen.has(href) || href.includes('#')) continue
    seen.add(href)
    const slug = href.replace('/offre-emploi-', '').replace(/\.html.*$/, '')
    const parts = slug.split('-recrutement-')
    const titleSlug = (parts[0] || '').replace(/-hf$|-fh$/, '')
    const rest = parts[1] || ''
    const restParts = rest.split('-')
    const citySlug = restParts[restParts.length - 2] || ''
    const companySlug = restParts.slice(0, restParts.length - 2).join(' ')
    const title = titleSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const company = companySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const city = citySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    if (!title || title.length < 4) continue
    jobs.push({
      title,
      company,
      location: city || 'Morocco',
      salary: '',
      jobUrl: `https://www.rekrute.com${href}`,
      description: '',
      source: 'Rekrute (Morocco)',
    })
  }
  return jobs
}

async function scrapeBayt(query, location) {
  const loc = (location || '').toLowerCase()
  const isMENA = ['morocco', 'uae', 'dubai', 'saudi', 'egypt', 'jordan', 'kuwait', 'qatar', 'bahrain', 'oman', 'lebanon', 'mena'].some(t => loc.includes(t))
  if (!isMENA && loc) return []
  const slug = query.trim().replace(/\s+/g, '-').toLowerCase()
  const url = `https://www.bayt.com/en/international/jobs/${encodeURIComponent(slug)}-jobs/`
  const res = await fetchWithTimeout(url, { headers: HEADERS }, 10000)
  if (!res.ok) return []
  const html = await res.text()
  const doc = parse(html)
  const jobs = []
  const cards = doc.querySelectorAll('[data-js-job], .media-list li, li[class*="job"]')
  for (const card of cards) {
    const titleEl = card.querySelector('h2 a, h3 a, [class*="title"] a')
    if (!titleEl) continue
    const title = cleanText(titleEl.textContent)
    const href = titleEl.getAttribute('href') || ''
    const company = cleanText(card.querySelector('[class*="company"], [class*="employer"]')?.textContent || '')
    const location = cleanText(card.querySelector('[class*="location"]')?.textContent || '')
    if (!title || title.length < 4) continue
    jobs.push({
      title,
      company,
      location: location || 'MENA',
      salary: '',
      jobUrl: href.startsWith('http') ? href : `https://www.bayt.com${href}`,
      description: '',
      source: 'Bayt (MENA)',
    })
  }
  return jobs
}

// ── SerpAPI Google Jobs ───────────────────────────────────────────────────────

async function scrapeGoogleJobs(query, location) {
  const key = process.env.SERPAPI_KEY
  if (!key) return []

  const params = new URLSearchParams({
    engine: 'google_jobs',
    q: location ? `${query} in ${location}` : query,
    api_key: key,
    num: '30',
  })
  if (location) params.set('location', location)

  const url = `https://serpapi.com/search.json?${params}`
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 20000)
  if (!res.ok) return []
  const data = await res.json()

  return (data.jobs_results || []).map(j => {
    const salary = j.detected_extensions?.salary || ''
    const schedule = j.detected_extensions?.schedule_type || ''
    const remote = j.detected_extensions?.work_from_home ? 'Remote' : ''
    const applyLink = (j.apply_options || [])[0]?.link || ''
    return {
      title: j.title || '',
      company: j.company_name || '',
      location: j.location || remote || '',
      salary,
      jobUrl: applyLink || '',
      description: (j.description || '').slice(0, 800),
      source: `Google Jobs (via ${j.via || 'web'})`,
      _schedule: schedule,
    }
  })
}

// ── main scrapeJobSearch export ───────────────────────────────────────────────

export async function scrapeJobSearch({ query, location, experience }) {
  const q = (query || '').toLowerCase()
  const queryTerms = q.split(/\s+/).filter(t => t.length > 2)
  const includeCrypto = isCryptoQuery(q)

  const loc = (location || '').toLowerCase()
  const isMorocco = loc.includes('morocco') || loc.includes('maroc') || loc.includes('casablanca') || loc.includes('rabat') || loc.includes('marrakech')
  const isMENA = isMorocco || ['uae', 'dubai', 'saudi', 'egypt', 'jordan', 'kuwait', 'qatar', 'bahrain', 'oman', 'lebanon'].some(t => loc.includes(t))

  const tasks = [
    scrapeGoogleJobs(query || '', location || '').catch(() => []),
    scrapeRemoteOK(query || '').catch(() => []),
    scrapeRemotive(query || '').catch(() => []),
    scrapeJobicy(query || '').catch(() => []),
    scrapeTheMuse(query || '').catch(() => []),
    scrapeHimalayas(query || '').catch(() => []),
    scrapeAllATS(queryTerms, includeCrypto).catch(() => []),
  ]

  if (isMorocco) tasks.push(scrapeRekrute(query || '').catch(() => []))
  if (isMENA) tasks.push(scrapeBayt(query || '', location || '').catch(() => []))

  if (includeCrypto) {
    tasks.push(scrapeWeb3Career(query || '').catch(() => []))
    tasks.push(scrapeCryptoJobsList(query || '').catch(() => []))
    tasks.push(scrapeCryptocurrencyJobs(query || '').catch(() => []))
  }

  const settled = await Promise.allSettled(tasks)
  const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : [])

  // Filter: must have a title, must match at least one query term
  const filtered = all.filter(job => {
    if (!job.title) return false
    if (!matchesQuery(job, queryTerms)) return false
    return true
  })

  // Score, dedupe, sort
  const scored = filtered.map(job => ({
    ...job,
    score: scoreJob(job, queryTerms, location),
  }))

  const deduped = dedupeJobs(scored)
  deduped.sort((a, b) => b.score - a.score)

  return deduped.slice(0, 80)
}

// ── scrapeJobPosting (single URL) ─────────────────────────────────────────────

function fromJsonLd(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.textContent)
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const type = (item['@type'] || '').toLowerCase()
        if (type.includes('jobposting')) {
          return {
            title: cleanText(item.title || ''),
            company: cleanText(item.hiringOrganization?.name || item.author?.name || ''),
            description: cleanText(item.description || ''),
            location: item.jobLocation?.address?.addressLocality || item.jobLocation?.address?.streetAddress || '',
            salary: item.baseSalary?.value?.value || item.baseSalary?.value || item.salary || '',
          }
        }
      }
    } catch (_) { continue }
  }
  return null
}

function getElementText(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector)
    if (el && el.textContent.trim()) return cleanText(el.textContent)
  }
  return ''
}

function getTitle(doc) {
  const title = getElementText(doc, [
    'h1', '.topcard__title', '.job-title', '.posting-headline__title',
    '.jobsearch-JobInfoHeader-title', '.jobViewJobTitle', '.jobHeaderTitle',
  ])
  if (title) return title
  const titleTag = doc.querySelector('title')
  if (titleTag) return cleanText(titleTag.textContent.replace(/\|.*$/, '').replace(/-.*$/, ''))
  return ''
}

function getCompany(doc) {
  return getElementText(doc, [
    'meta[property="og:site_name"]', 'meta[name="application-name"]',
    '.topcard__org-name-link', '.topcard__flavor', '.companyName',
    '.job-info-company', '.job_listing-company',
  ])
}

function getDescription(doc) {
  const descSelectors = [
    '#jobDescriptionText', '.job-description', '.description', '.jobDescription',
    '.listing-container', '.job-desc', 'section[class*="description"]', 'div[class*="description"]',
  ]
  for (const selector of descSelectors) {
    const el = doc.querySelector(selector)
    if (el && el.textContent.trim().length > 120) return cleanText(el.textContent)
  }
  const text = cleanText(doc.textContent || '')
  const match = text.match(/((?:responsibilities|requirements|about the role|job description|what you.ll do|who you are)[\s\S]{120,})/i)
  if (match) return cleanText(match[1])
  return text.slice(0, 3000)
}

function parseByHost(hostname, doc) {
  if (hostname.includes('linkedin.com')) return {
    title: getElementText(doc, ['.top-card-layout__title', '.topcard__title', 'h1']),
    company: getElementText(doc, ['.topcard__org-name-link', '.topcard__flavor']),
    description: getElementText(doc, ['.description__text', '#job-details', '.show-more-less-html__markup']),
  }
  if (hostname.includes('indeed.com')) return {
    title: getElementText(doc, ['h1.jobsearch-JobInfoHeader-title', '#vjs-jobtitle']),
    company: getElementText(doc, ['div.jobsearch-InlineCompanyRating div:first-child']),
    description: getElementText(doc, ['div#jobDescriptionText']),
  }
  if (hostname.includes('greenhouse.io')) return {
    title: getElementText(doc, ['h1[class*="job-title"]', 'h1']),
    company: getElementText(doc, ['a[class*="name"]', '.company-name']),
    description: getElementText(doc, ['div[class*="content"]', '#content']),
  }
  if (hostname.includes('lever.co')) return {
    title: getElementText(doc, ['.posting-headline h2', 'h2']),
    company: getElementText(doc, ['.main-header-logo img']),
    description: getElementText(doc, ['.posting-content', '.section-wrapper']),
  }
  if (hostname.includes('workable.com')) return {
    title: getElementText(doc, ['h1', '.posting-headline__title']),
    company: getElementText(doc, ['.posting-headline__company']),
    description: getElementText(doc, ['.posting-content', '.job-description']),
  }
  return null
}

export async function scrapeJobPosting(url) {
  const response = await fetchWithTimeout(url, { headers: HEADERS }, 15000)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)

  const html = await response.text()
  const doc = parse(html, { script: true, style: true, pre: true })

  const ld = fromJsonLd(doc)
  if (ld && ld.title && ld.description) {
    return {
      jobTitle: ld.title,
      company: ld.company || '',
      jobDescription: ld.description,
      location: ld.location || '',
      salary: ld.salary || '',
    }
  }

  const host = new URL(url).hostname
  const boardResult = parseByHost(host, doc)
  const pick = (a, b) => (a && a.length > 3 ? cleanText(a) : b && b.length > 3 ? cleanText(b) : '')

  return {
    jobTitle: pick(boardResult?.title, getTitle(doc)),
    company: pick(boardResult?.company, getCompany(doc)),
    jobDescription: pick(boardResult?.description, getDescription(doc)),
    location: '',
    salary: '',
  }
}
