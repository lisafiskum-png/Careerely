// Step 3 option lists and search, verbatim from design/onboarding-step3-wip.html.
// Custom values are always allowed (Searches spec: custom chip input required).

export type ChipFieldId = 'fn' | 'ai' | 'loc'

export const FUNCTIONS: string[] = ['Account Executive','Account Management','AI Engineer','AI Researcher','AML Analyst','AML Officer','Android Engineer','Art Director','Backend Engineer','Brand Designer','Brand Marketing Manager','Business Analyst','Business Development Manager','Business Intelligence Analyst','Business Operations Manager','Campaign Manager','CFO','Chief of Staff','CISO','CMO','COO','Compliance Analyst','Compliance Manager','Community Manager','Content Marketing Manager','Controller','Corporate Development Manager','CPO','Creative Director','CRO','CTO','Customer Success Lead','Customer Success Manager','Customer Support Manager','Data Analyst','Data Architect','Data Engineer','Data Scientist','Demand Generation Manager','Design Lead','Design Systems Lead','Developer Relations','DevOps Engineer','Digital Marketing Manager','Director of Engineering','Director of Marketing','Director of Operations','Director of Product','Director of Sales','Email Marketing Manager','Embedded Engineer','Engineering Manager','Enterprise Account Executive','Entrepreneur in Residence','Finance Manager','Financial Analyst','Firmware Engineer','FP&A Manager','Founder','Frontend Engineer','Full-stack Engineer','General Counsel','Group Product Manager','Growth Marketing Manager','HR Business Partner','HR Manager','Head of Customer Success','Head of Data','Head of Design','Head of Engineering','Head of Finance','Head of Growth','Head of Operations','Head of Partnerships','Head of People','Head of Product','Head of Sales','Head of Security','Head of Talent','Implementation Manager','In-house Counsel','Infrastructure Engineer','Investment Analyst','Investor Relations Manager','iOS Engineer','Legal Counsel','Legal Operations Manager','M&A Analyst','Marketing Analyst','Marketing Manager','Marketing Operations Manager','Mid-Market Account Executive','ML Engineer','Mobile Engineer','Motion Designer','Onboarding Manager','Paid Acquisition Manager','Paralegal','Partnerships Manager','People Operations Manager','Performance Marketing Manager','Platform Engineer','Pre-Sales Engineer','Principal Product Manager','Principal Software Engineer','Product Analyst','Product Designer','Product Director','Product Lead','Product Manager','Product Marketing Manager','Product Operations Manager','Program Manager','Project Manager','PR Manager','Quantitative Analyst','Recruiting Manager','Recruiter','Regional Sales Manager','Regulatory Affairs Manager','Research Scientist','Revenue Operations Manager','Risk Analyst','Risk Manager','Sales Development Representative','Sales Engineer','Sales Manager','SDR','Security Engineer','Senior Account Executive','Senior Business Development Manager','Senior CSM','Senior Data Analyst','Senior Data Scientist','Senior Engineering Manager','Senior Financial Analyst','Senior Operations Manager','Senior Product Manager','Senior Recruiter','Senior Sales Manager','Senior Software Engineer','Site Reliability Engineer','Smart Contract Developer','Social Media Manager','Software Engineer','Solutions Architect','Solutions Engineer','Staff Software Engineer','Strategic Partnerships Manager','Strategy & Operations Manager','Strategy Consultant','Technical Account Manager','Technical Architect','Technical Product Manager','Technical Recruiter','Technical Sales','Treasury Analyst','UX Designer','UX Researcher','UX Writer','UI Designer','Venture Capital Analyst','Visual Designer','VP Customer Success','VP Engineering','VP Finance','VP Marketing','VP Operations','VP People','VP Product','VP Sales','Web3 Engineer'].sort()

export const AREAS: string[] = ['AdTech','Aerospace & Defence','AgriTech','AI & Machine Learning','Analytics & BI','API & Integration','Artificial Intelligence','Autonomous Vehicles','B2B SaaS','Banking Technology','BioTech','Blockchain & Crypto','Buy Now Pay Later','Carbon Technology','Clean Energy','Climate Tech','Cloud Computing','Compliance Technology','Construction Technology','Consumer Tech','Creator Economy','Cryptocurrency','Cybersecurity','DAOs','Data Infrastructure','Database Technology','DeFi','Defence Technology','Developer Tools','DevOps & Infrastructure','Digital Assets','Digital Banking','Digital Health','Direct-to-Consumer','Drones & UAVs','E-commerce','EdTech','Embedded Finance','Enterprise Software','Esports','Fintech','Food Technology','Future of Work','Gaming','Generative AI','GovTech','HealthTech','HRTech','Identity & Access Management','Industrial IoT','InsurTech','KYC & Identity','Legal Tech','Lending Technology','LLMs & Foundation Models','Logistics & Supply Chain','Low-code & No-code','Manufacturing Technology','Marketplace','MarTech','Media & Entertainment','MedTech','Mental Health Technology','ML Infrastructure','MLOps','Mobility','Music Technology','NFTs & Digital Assets','Open Source Software','Payments','Pharmaceutical Technology','PropTech','Real Estate Technology','RegTech','Renewable Energy','Retail Technology','Robotics & Automation','Smart Cities','Social Commerce','SpaceTech','Sports Technology','Stablecoins','Subscription Commerce','Sustainability','Telemedicine','Telecommunications','Transportation Technology','Travel & Hospitality Technology','VR & AR','Water Technology','WealthTech','Web3','Workforce Technology','5G & Connectivity'].sort()

export const LOCATIONS: string[] = ['Abu Dhabi, UAE','Accra, Ghana','Amsterdam, Netherlands','Antwerp, Belgium','Athens, Greece','Atlanta, USA','Auckland, New Zealand','Austin, USA','Bahrain','Bangalore, India','Bangkok, Thailand','Barcelona, Spain','Basel, Switzerland','Beijing, China','Beirut, Lebanon','Belgrade, Serbia','Bergen, Norway','Berlin, Germany','Bern, Switzerland','Bilbao, Spain','Birmingham, UK','Bogotá, Colombia','Bologna, Italy','Boston, USA','Bratislava, Slovakia','Brussels, Belgium','Bucharest, Romania','Budapest, Hungary','Buenos Aires, Argentina','Calgary, Canada','Cape Town, South Africa','Chennai, India','Chicago, USA','Copenhagen, Denmark','Cork, Ireland','Dallas, USA','Delhi, India','Denver, USA','Doha, Qatar','Drammen, Norway','Dubai, UAE','Dublin, Ireland','Düsseldorf, Germany','Edinburgh, UK','Florence, Italy','Frankfurt, Germany','Geneva, Switzerland','Glasgow, UK','Gothenburg, Sweden','Guadalajara, Mexico','Hamburg, Germany','Hanoi, Vietnam','Helsinki, Finland','Ho Chi Minh City, Vietnam','Hong Kong','Houston, USA','Hyderabad, India','Istanbul, Turkey','Jakarta, Indonesia','Jeddah, Saudi Arabia','Johannesburg, South Africa','Kuala Lumpur, Malaysia','Kuwait City, Kuwait','Kyiv, Ukraine','Lagos, Nigeria','Lausanne, Switzerland','Leeds, UK','Lima, Peru','Lisbon, Portugal','Ljubljana, Slovenia','London, UK','Los Angeles, USA','Lyon, France','Madrid, Spain','Málaga, Spain','Manchester, UK','Manila, Philippines','Marseille, France','Medellín, Colombia','Melbourne, Australia','Mexico City, Mexico','Miami, USA','Milan, Italy','Minneapolis, USA','Monterrey, Mexico','Montreal, Canada','Mumbai, India','Munich, Germany','Muscat, Oman','Nairobi, Kenya','Naples, Italy','Nashville, USA','New York, USA','Oslo, Norway','Osaka, Japan','Ottawa, Canada','Paris, France','Perth, Australia','Philadelphia, USA','Phoenix, USA','Porto, Portugal','Portland, USA','Prague, Czech Republic','Pune, India','Reykjavik, Iceland','Riga, Latvia','Rio de Janeiro, Brazil','Riyadh, Saudi Arabia','Rome, Italy','Rotterdam, Netherlands','Salt Lake City, USA','San Diego, USA','San Francisco, USA','Santiago, Chile','São Paulo, Brazil','Seattle, USA','Seoul, South Korea','Shanghai, China','Shenzhen, China','Singapore','Sofia, Bulgaria','Stavanger, Norway','Stockholm, Sweden','Sydney, Australia','Taipei, Taiwan','Tallinn, Estonia','Tel Aviv, Israel','The Hague, Netherlands','Tokyo, Japan','Toronto, Canada','Trondheim, Norway','Turin, Italy','Valencia, Spain','Vancouver, Canada','Vienna, Austria','Vilnius, Lithuania','Warsaw, Poland','Washington DC, USA','Zagreb, Croatia','Zurich, Switzerland','Remote (Worldwide)','Remote (Europe)','Remote (Americas)','Remote (Asia-Pacific)','Remote (UK)','Remote (US)','Remote (EMEA)'].sort((a, b) => a.localeCompare(b))

export const POPULAR: Record<ChipFieldId, string[]> = {
  fn: ['Software Engineer','Product Manager','Business Development Manager','Sales','Customer Success Manager','Marketing Manager','Data Scientist','Account Executive'],
  ai: ['AI & Machine Learning','Fintech','B2B SaaS','Cybersecurity','Developer Tools','Climate Tech','Web3','Digital Health'],
  loc: ['London, UK','New York, USA','Berlin, Germany','Amsterdam, Netherlands','Oslo, Norway','Dubai, UAE','Singapore','Remote (Worldwide)','Remote (Europe)']
}

export const ALIASES: Record<string, string> = {
  'ae':'Account Executive','bdr':'Business Development Representative','sdr':'Sales Development Representative',
  'ml':'Machine Learning','pm':'Product Manager','em':'Engineering Manager','tpm':'Technical Product Manager',
  'csm':'Customer Success Manager','vc':'Venture Capital Analyst','se':'Solutions Engineer',
  'sa':'Solutions Architect','sre':'Site Reliability Engineer','gtm':'Go-to-Market',
  'devrel':'Developer Relations','revops':'Revenue Operations Manager',
  'ceo':'CEO','cto':'CTO','cpo':'CPO','cfo':'CFO','cmo':'CMO','coo':'COO',
  'bd':'Business Development Manager','bus dev':'Business Development Manager',
  'cs':'Customer Success Manager','ux':'UX Designer',
  'fe':'Frontend Engineer','be':'Backend Engineer','fs':'Full-stack Engineer',
  'ios':'iOS Engineer','devops':'DevOps Engineer',
  'fintech':'Fintech','defi':'DeFi','nft':'NFTs & Digital Assets',
  'web 3':'Web3','crypto':'Blockchain & Crypto','blockchain':'Blockchain & Crypto',
  'nyc':'New York, USA','ny':'New York, USA','sf':'San Francisco, USA',
  'la':'Los Angeles, USA','dc':'Washington DC, USA','uk':'London, UK','uae':'Dubai, UAE'
}

export const OPTIONS: Record<ChipFieldId, string[]> = { fn: FUNCTIONS, ai: AREAS, loc: LOCATIONS }

export function scoreMatch(q: string, item: string): number {
  const ql = q.toLowerCase().trim()
  const il = item.toLowerCase()
  if (!ql) return 0
  if (il === ql) return 100
  if (il.startsWith(ql)) return 90
  const qw = ql.split(/\s+/)
  const iw = il.split(/[\s&,/\-]+/)
  if (qw.length > 1) {
    let pos = 0
    if (
      qw.every(qword => {
        const idx = iw.slice(pos).findIndex(iword => iword.startsWith(qword))
        if (idx >= 0) {
          pos += idx + 1
          return true
        }
        return false
      })
    )
      return 80
  }
  if (iw.some(w => w.startsWith(ql))) return 70
  const acronym = iw.map(w => w[0]).join('')
  if (acronym.startsWith(ql)) return 60
  if (acronym.includes(ql)) return 40
  if (il.includes(ql)) return 30
  let ci = 0
  for (const ch of ql) {
    ci = il.indexOf(ch, ci)
    if (ci === -1) return 0
    ci++
  }
  return 10
}

/** Up to 12 options for a query, excluding values already chosen. */
export function searchOptions(id: ChipFieldId, q: string, chosen: string[]): string[] {
  const alias = ALIASES[q.toLowerCase().trim()]
  const aliasBoost = alias && OPTIONS[id].includes(alias) && !chosen.includes(alias) ? [alias] : []
  const scored = OPTIONS[id]
    .filter(item => !chosen.includes(item))
    .map(item => ({ item, score: scoreMatch(q, item) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item)
  return [...new Set([...aliasBoost, ...scored])].slice(0, 12)
}
