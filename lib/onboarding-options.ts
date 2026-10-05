// Global role / industry suggestions for onboarding and Searches.
// These lists are discovery helpers, never a whitelist: users can always type
// any role, industry, domain or location that is not listed here.

export type ChipFieldId = 'fn' | 'ai' | 'loc'

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

export const FUNCTIONS: string[] = uniqueSorted([
  // Administration & office
  'Administrative Assistant','Executive Assistant','Office Administrator','Office Manager','Receptionist','Secretary','Personal Assistant','Data Entry Clerk','Records Manager','Facilities Coordinator','Facilities Manager',
  // Accounting, banking & finance
  'Accountant','Accounting Assistant','Accounting Manager','Accounts Payable Specialist','Accounts Receivable Specialist','Auditor','Bookkeeper','Controller','CFO','Finance Manager','Financial Analyst','Financial Advisor','FP&A Manager','Investment Analyst','Portfolio Manager','Private Banker','Relationship Manager','Bank Teller','Credit Analyst','Loan Officer','Mortgage Advisor','Insurance Advisor','Insurance Underwriter','Claims Adjuster','Treasury Analyst','Tax Advisor','Tax Accountant','Payroll Specialist','Quantitative Analyst','Investor Relations Manager','M&A Analyst','Venture Capital Analyst',
  // Sales, business development & customer
  'Sales Associate','Sales Representative','Sales Consultant','Sales Manager','Regional Sales Manager','Account Executive','Senior Account Executive','Enterprise Account Executive','Mid-Market Account Executive','Account Manager','Key Account Manager','Account Management','Business Development Representative','Business Development Manager','Senior Business Development Manager','Partnerships Manager','Strategic Partnerships Manager','Head of Partnerships','Sales Development Representative','SDR','Technical Sales','Sales Engineer','Pre-Sales Engineer','Solutions Engineer','Customer Service Representative','Customer Support Specialist','Customer Support Manager','Customer Success Manager','Customer Success Lead','Senior CSM','VP Customer Success','Head of Customer Success','Call Center Agent','Retail Sales Associate','Store Manager',
  // Marketing, communications & creative
  'Marketing Assistant','Marketing Coordinator','Marketing Specialist','Marketing Manager','Director of Marketing','VP Marketing','CMO','Brand Manager','Brand Marketing Manager','Digital Marketing Manager','Growth Marketing Manager','Performance Marketing Manager','Content Marketing Manager','Social Media Manager','Community Manager','PR Manager','Public Relations Specialist','Communications Manager','Communications Specialist','Copywriter','Content Writer','Editor','Journalist','Photographer','Videographer','Graphic Designer','Brand Designer','Visual Designer','Art Director','Creative Director','Motion Designer','UI Designer','UX Designer','UX Writer','UX Researcher','Campaign Manager','Email Marketing Manager','Demand Generation Manager','Paid Acquisition Manager','Marketing Analyst','Marketing Operations Manager','Product Marketing Manager',
  // Healthcare & care
  'Doctor','Physician','General Practitioner','Registered Nurse','Nurse','Nurse Practitioner','Nursing Assistant','Healthcare Assistant','Care Assistant','Caregiver','Dentist','Dental Assistant','Dental Hygienist','Pharmacist','Pharmacy Technician','Physiotherapist','Physical Therapist','Occupational Therapist','Psychologist','Psychiatrist','Therapist','Counsellor','Social Worker','Radiographer','Radiologic Technologist','Medical Assistant','Medical Secretary','Medical Receptionist','Paramedic','Emergency Medical Technician','Midwife','Veterinarian','Veterinary Nurse','Veterinary Assistant','Laboratory Technician','Biomedical Scientist','Clinical Research Coordinator','Clinical Research Associate','Public Health Specialist','Nutritionist','Dietitian',
  // Education, research & childcare
  'Teacher','Primary School Teacher','Secondary School Teacher','Special Education Teacher','Teaching Assistant','Preschool Teacher','Kindergarten Teacher','University Lecturer','Professor','Tutor','School Counsellor','School Administrator','Principal','Librarian','Research Assistant','Researcher','Research Scientist','Laboratory Assistant','Childcare Worker','Nanny','Youth Worker','Training Coordinator','Learning & Development Specialist',
  // Hospitality, travel & food
  'Hotel Receptionist','Hotel Manager','Front Desk Agent','Guest Services Agent','Concierge','Housekeeper','Restaurant Manager','Waiter','Waitress','Server','Bartender','Barista','Chef','Sous Chef','Cook','Kitchen Assistant','Catering Manager','Event Coordinator','Event Manager','Travel Agent','Travel Consultant','Tour Guide','Flight Attendant','Cabin Crew','Ground Staff',
  // Retail, beauty & personal services
  'Cashier','Retail Assistant','Retail Manager','Store Manager','Merchandiser','Visual Merchandiser','Buyer','Purchasing Assistant','Hairdresser','Barber','Beautician','Beauty Therapist','Makeup Artist','Nail Technician','Personal Trainer','Fitness Instructor','Spa Therapist',
  // Construction, engineering & skilled trades
  'Architect','Architectural Technician','Civil Engineer','Structural Engineer','Mechanical Engineer','Electrical Engineer','Chemical Engineer','Industrial Engineer','Manufacturing Engineer','Process Engineer','Quality Engineer','Project Engineer','Site Engineer','Construction Manager','Site Manager','Quantity Surveyor','Surveyor','Estimator','Electrician','Plumber','Carpenter','Joiner','Welder','Painter','Decorator','Bricklayer','Roofer','HVAC Technician','Maintenance Technician','Field Service Technician','Mechanic','Automotive Mechanic','Auto Technician','Heavy Equipment Operator','Machine Operator','CNC Operator','Production Worker','Assembler','Quality Inspector','Maintenance Manager',
  // Logistics, supply chain & transport
  'Supply Chain Analyst','Supply Chain Manager','Logistics Coordinator','Logistics Manager','Warehouse Worker','Warehouse Manager','Inventory Specialist','Inventory Manager','Procurement Specialist','Procurement Manager','Buyer','Purchasing Manager','Dispatcher','Delivery Driver','Truck Driver','Bus Driver','Taxi Driver','Train Driver','Courier','Forklift Operator','Operations Coordinator','Operations Manager','Senior Operations Manager','Director of Operations','VP Operations','COO',
  // Legal, compliance & risk
  'Lawyer','Attorney','Solicitor','Barrister','Legal Counsel','General Counsel','In-house Counsel','Paralegal','Legal Assistant','Legal Secretary','Legal Operations Manager','Compliance Analyst','Compliance Officer','Compliance Manager','AML Analyst','AML Officer','KYC Analyst','Risk Analyst','Risk Manager','Regulatory Affairs Specialist','Regulatory Affairs Manager','Privacy Officer','Data Protection Officer','Fraud Analyst','Fraud Investigator',
  // People, HR & recruitment
  'HR Assistant','HR Coordinator','HR Generalist','HR Manager','HR Business Partner','People Operations Manager','Recruiter','Senior Recruiter','Recruiting Manager','Talent Acquisition Specialist','Talent Acquisition Manager','Technical Recruiter','Head of Talent','Head of People','VP People','Compensation & Benefits Specialist','Employee Relations Specialist','Learning & Development Manager',
  // Public sector, nonprofit & safety
  'Civil Servant','Policy Analyst','Policy Advisor','Public Affairs Manager','Government Relations Manager','Police Officer','Firefighter','Security Guard','Security Officer','Correctional Officer','Military Officer','Emergency Dispatcher','Case Worker','Program Officer','Program Manager','Fundraising Manager','Grant Writer','Nonprofit Manager','Community Outreach Coordinator',
  // Science, agriculture & environment
  'Biologist','Chemist','Physicist','Environmental Scientist','Environmental Consultant','Geologist','Microbiologist','Food Scientist','Agronomist','Agricultural Engineer','Farm Manager','Farm Worker','Horticulturist','Sustainability Manager','Sustainability Consultant','Renewable Energy Engineer','Environmental Engineer',
  // Property & real estate
  'Real Estate Agent','Real Estate Broker','Property Manager','Lettings Agent','Leasing Consultant','Real Estate Analyst','Real Estate Manager','Property Administrator','Mortgage Advisor',
  // Product, project, strategy & consulting
  'Business Analyst','Business Intelligence Analyst','Business Operations Manager','Project Coordinator','Project Manager','Program Manager','Product Analyst','Product Manager','Senior Product Manager','Principal Product Manager','Product Lead','Product Director','Director of Product','VP Product','CPO','Strategy Consultant','Management Consultant','Strategy & Operations Manager','Chief of Staff','Entrepreneur in Residence','Founder','CEO',
  // Technology, data & digital
  'IT Support Specialist','IT Technician','Systems Administrator','Network Administrator','Network Engineer','Cybersecurity Analyst','Security Engineer','Head of Security','CISO','Software Engineer','Senior Software Engineer','Principal Software Engineer','Staff Software Engineer','Frontend Engineer','Backend Engineer','Full-stack Engineer','Mobile Engineer','Android Engineer','iOS Engineer','Web Developer','DevOps Engineer','Site Reliability Engineer','Platform Engineer','Infrastructure Engineer','Cloud Engineer','Solutions Architect','Technical Architect','Technical Account Manager','Data Analyst','Senior Data Analyst','Data Scientist','Senior Data Scientist','Data Engineer','Data Architect','Machine Learning Engineer','ML Engineer','AI Engineer','AI Researcher','Business Intelligence Developer','Database Administrator','QA Engineer','Software Tester','Product Designer','Design Lead','Design Systems Lead','Engineering Manager','Senior Engineering Manager','Director of Engineering','VP Engineering','Head of Engineering','CTO','Developer Relations','Firmware Engineer','Embedded Engineer','Smart Contract Developer','Web3 Engineer','Technical Product Manager','Implementation Manager',
  // Executive / general leadership
  'Managing Director','General Manager','Country Manager','Regional Manager','Operations Director','Commercial Director','Business Unit Manager','COO','CFO','CTO','CMO','CPO','CRO','CEO',
])

export const AREAS: string[] = uniqueSorted([
  // Broad sectors
  'Accounting','Advertising','Aerospace & Defence','Agriculture','Architecture','Arts & Culture','Automotive','Banking','Beauty & Personal Care','Construction','Consulting','Consumer Goods','Customer Service','Education','Energy','Engineering','Entertainment','Environmental Services','Fashion','Financial Services','Food & Beverage','Government & Public Sector','Healthcare','Hospitality','Human Resources','Insurance','Legal Services','Logistics & Supply Chain','Manufacturing','Media & Publishing','Mining & Metals','Nonprofit & Charity','Pharmaceuticals','Professional Services','Property & Real Estate','Public Safety','Recruitment & Staffing','Retail','Sales','Science & Research','Sports & Fitness','Telecommunications','Transportation','Travel & Tourism','Utilities','Veterinary','Wholesale',
  // More specific industries / domains
  'Airlines & Aviation','Asset Management','Audit & Assurance','Biotechnology','Broadcasting','Childcare','Clinical Research','Commercial Real Estate','Consumer Finance','Cybersecurity','Dental Care','E-commerce','Events','Facilities Management','Film & Television','Food Production','Freight & Shipping','Gaming','Hotels & Resorts','Industrial Equipment','Investment Banking','Investment Management','Law Enforcement','Luxury Goods','Medical Devices','Mental Health','Music','Oil & Gas','Primary & Secondary Education','Renewable Energy','Restaurants','Social Care','Software & Technology','Staffing & Recruiting','Warehousing','Wealth Management',
  // Technology and innovation domains retained for users who want them
  'AdTech','AgriTech','AI & Machine Learning','Analytics & BI','API & Integration','Artificial Intelligence','Autonomous Vehicles','B2B SaaS','Banking Technology','BioTech','Blockchain & Crypto','Buy Now Pay Later','Carbon Technology','Clean Energy','Climate Tech','Cloud Computing','Compliance Technology','Construction Technology','Consumer Tech','Creator Economy','Cryptocurrency','Cybersecurity','DAOs','Data Infrastructure','Database Technology','DeFi','Defence Technology','Developer Tools','DevOps & Infrastructure','Digital Assets','Digital Banking','Digital Health','Direct-to-Consumer','Drones & UAVs','EdTech','Embedded Finance','Enterprise Software','Esports','Fintech','Food Technology','Future of Work','Generative AI','GovTech','HealthTech','HRTech','Identity & Access Management','Industrial IoT','InsurTech','KYC & Identity','Legal Tech','Lending Technology','LLMs & Foundation Models','Low-code & No-code','Manufacturing Technology','Marketplace','MarTech','MedTech','Mental Health Technology','ML Infrastructure','MLOps','Mobility','Music Technology','NFTs & Digital Assets','Open Source Software','Payments','Pharmaceutical Technology','PropTech','RegTech','Retail Technology','Robotics & Automation','Smart Cities','Social Commerce','SpaceTech','Sports Technology','Stablecoins','Subscription Commerce','Sustainability','Telemedicine','Transportation Technology','Travel & Hospitality Technology','VR & AR','Water Technology','WealthTech','Web3','Workforce Technology','5G & Connectivity',
])

// Static fallbacks / popular locations. The product also uses worldwide remote
// location autocomplete, so this list is intentionally only a fast starter set.
export const LOCATIONS: string[] = ['Abu Dhabi, UAE','Accra, Ghana','Amsterdam, Netherlands','Antwerp, Belgium','Athens, Greece','Atlanta, USA','Auckland, New Zealand','Austin, USA','Bahrain','Bangalore, India','Bangkok, Thailand','Barcelona, Spain','Basel, Switzerland','Beijing, China','Beirut, Lebanon','Belgrade, Serbia','Bergen, Norway','Berlin, Germany','Bern, Switzerland','Bilbao, Spain','Birmingham, UK','Bogotá, Colombia','Bologna, Italy','Boston, USA','Bratislava, Slovakia','Brussels, Belgium','Bucharest, Romania','Budapest, Hungary','Buenos Aires, Argentina','Calgary, Canada','Cape Town, South Africa','Chennai, India','Chicago, USA','Copenhagen, Denmark','Cork, Ireland','Dallas, USA','Delhi, India','Denver, USA','Doha, Qatar','Drammen, Norway','Dubai, UAE','Dublin, Ireland','Düsseldorf, Germany','Edinburgh, UK','Florence, Italy','Frankfurt, Germany','Geneva, Switzerland','Glasgow, UK','Gothenburg, Sweden','Guadalajara, Mexico','Hamburg, Germany','Hanoi, Vietnam','Helsinki, Finland','Ho Chi Minh City, Vietnam','Hong Kong','Houston, USA','Hyderabad, India','Istanbul, Turkey','Jakarta, Indonesia','Jeddah, Saudi Arabia','Johannesburg, South Africa','Kuala Lumpur, Malaysia','Kuwait City, Kuwait','Kyiv, Ukraine','Lagos, Nigeria','Lausanne, Switzerland','Leeds, UK','Lima, Peru','Lisbon, Portugal','Ljubljana, Slovenia','London, UK','Los Angeles, USA','Lyon, France','Madrid, Spain','Málaga, Spain','Manchester, UK','Manila, Philippines','Marseille, France','Medellín, Colombia','Melbourne, Australia','Mexico City, Mexico','Miami, USA','Milan, Italy','Minneapolis, USA','Monterrey, Mexico','Montreal, Canada','Mumbai, India','Munich, Germany','Muscat, Oman','Nairobi, Kenya','Naples, Italy','Nashville, USA','New York, USA','Oslo, Norway','Osaka, Japan','Ottawa, Canada','Paris, France','Perth, Australia','Philadelphia, USA','Phoenix, USA','Porto, Portugal','Portland, USA','Prague, Czech Republic','Pune, India','Reykjavik, Iceland','Riga, Latvia','Rio de Janeiro, Brazil','Riyadh, Saudi Arabia','Rome, Italy','Rotterdam, Netherlands','Salt Lake City, USA','San Diego, USA','San Francisco, USA','Santiago, Chile','São Paulo, Brazil','Seattle, USA','Seoul, South Korea','Shanghai, China','Shenzhen, China','Singapore','Sofia, Bulgaria','Stavanger, Norway','Stockholm, Sweden','Sydney, Australia','Taipei, Taiwan','Tallinn, Estonia','Tel Aviv, Israel','The Hague, Netherlands','Tokyo, Japan','Toronto, Canada','Trondheim, Norway','Turin, Italy','Valencia, Spain','Vancouver, Canada','Vienna, Austria','Vilnius, Lithuania','Warsaw, Poland','Washington DC, USA','Zagreb, Croatia','Zurich, Switzerland','Remote (Worldwide)','Remote (Europe)','Remote (Americas)','Remote (Asia-Pacific)','Remote (UK)','Remote (US)','Remote (EMEA)'].sort((a, b) => a.localeCompare(b))

export const POPULAR: Record<ChipFieldId, string[]> = {
  fn: ['Project Manager','Accountant','Registered Nurse','Sales Representative','Teacher','Customer Service Representative','Software Engineer','Marketing Manager'],
  ai: ['Healthcare','Financial Services','Education','Retail','Construction','Manufacturing','Hospitality','Software & Technology'],
  loc: ['London, UK','New York, USA','Madrid, Spain','Paris, France','Oslo, Norway','Dubai, UAE','Singapore','Remote (Worldwide)','Remote (Europe)'],
}

export const ALIASES: Record<string, string> = {
  'ae':'Account Executive','bdr':'Business Development Representative','sdr':'Sales Development Representative',
  'rn':'Registered Nurse','lpn':'Nurse','cna':'Nursing Assistant','gp':'General Practitioner','emt':'Emergency Medical Technician',
  'ea':'Executive Assistant','pa':'Personal Assistant','pm':'Project Manager','acct':'Accountant','hr':'HR Generalist',
  'ml':'Machine Learning Engineer','em':'Engineering Manager','tpm':'Technical Product Manager',
  'csm':'Customer Success Manager','vc':'Venture Capital Analyst','se':'Solutions Engineer',
  'sa':'Solutions Architect','sre':'Site Reliability Engineer','gtm':'Commercial Director',
  'devrel':'Developer Relations','revops':'Revenue Operations Manager',
  'ceo':'CEO','cto':'CTO','cpo':'CPO','cfo':'CFO','cmo':'CMO','coo':'COO',
  'bd':'Business Development Manager','bus dev':'Business Development Manager',
  'cs':'Customer Service Representative','ux':'UX Designer',
  'fe':'Frontend Engineer','be':'Backend Engineer','fs':'Full-stack Engineer',
  'ios':'iOS Engineer','devops':'DevOps Engineer',
  'fintech':'Fintech','defi':'DeFi','nft':'NFTs & Digital Assets',
  'web 3':'Web3','crypto':'Blockchain & Crypto','blockchain':'Blockchain & Crypto',
  'nyc':'New York, USA','ny':'New York, USA','sf':'San Francisco, USA',
  'la':'Los Angeles, USA','dc':'Washington DC, USA','uk':'London, UK','uae':'Dubai, UAE',
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
