export const JOB_TITLES = [
  // Healthcare
  'Dentist', 'General Dentist', 'Orthodontist', 'Oral Surgeon', 'Dental Hygienist', 'Dental Assistant',
  'Doctor', 'General Practitioner', 'Physician', 'Surgeon', 'Cardiologist', 'Dermatologist',
  'Neurologist', 'Oncologist', 'Paediatrician', 'Psychiatrist', 'Radiologist', 'Anaesthesiologist',
  'Nurse', 'Registered Nurse', 'Nurse Practitioner', 'Midwife', 'Paramedic', 'EMT',
  'Pharmacist', 'Pharmacy Technician', 'Physiotherapist', 'Occupational Therapist', 'Speech Therapist',
  'Optometrist', 'Ophthalmologist', 'Veterinarian', 'Vet Technician', 'Nutritionist', 'Dietitian',
  'Psychologist', 'Therapist', 'Counsellor', 'Social Worker', 'Radiographer', 'Lab Technician',

  // Technology
  'Software Engineer', 'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'Mobile Engineer', 'iOS Engineer', 'Android Engineer', 'React Native Engineer',
  'DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer', 'Cloud Engineer',
  'Data Engineer', 'Machine Learning Engineer', 'AI Engineer',
  'Data Analyst', 'Business Intelligence Analyst', 'Analytics Engineer', 'Data Scientist',
  'Product Manager', 'Senior Product Manager', 'Principal Product Manager', 'Group Product Manager',
  'Product Designer', 'UX Designer', 'UI Designer', 'UX Researcher',
  'QA Engineer', 'Test Engineer', 'Security Engineer', 'Cybersecurity Analyst',
  'Solutions Architect', 'Enterprise Architect', 'Technical Architect',
  'Engineering Manager', 'VP of Engineering', 'CTO', 'Head of Engineering',
  'Scrum Master', 'Agile Coach', 'Technical Program Manager',
  'Database Administrator', 'Systems Administrator', 'Network Engineer',
  'Blockchain Developer', 'Smart Contract Developer', 'Web3 Developer',

  // Finance & Accounting
  'Accountant', 'Senior Accountant', 'Management Accountant', 'Financial Controller',
  'CFO', 'Finance Manager', 'Financial Analyst', 'Investment Analyst',
  'Investment Banker', 'Private Equity Analyst', 'Venture Capital Analyst',
  'Auditor', 'Internal Auditor', 'External Auditor', 'Forensic Accountant',
  'Tax Advisor', 'Tax Manager', 'Treasury Manager', 'Credit Analyst',
  'Risk Manager', 'Compliance Officer', 'AML Analyst', 'KYC Analyst',
  'Actuary', 'Underwriter', 'Insurance Broker', 'Financial Planner',
  'Wealth Manager', 'Portfolio Manager', 'Fund Manager', 'Trader',
  'FX Trader', 'Quantitative Analyst', 'Quant Developer',

  // Legal
  'Lawyer', 'Solicitor', 'Barrister', 'Attorney', 'Associate', 'Partner',
  'In-House Counsel', 'General Counsel', 'Legal Counsel', 'Paralegal',
  'Legal Assistant', 'Contract Manager', 'Compliance Manager', 'Privacy Officer',
  'IP Lawyer', 'Corporate Lawyer', 'Employment Lawyer', 'Litigation Lawyer',

  // Marketing & Communications
  'Marketing Manager', 'Head of Marketing', 'CMO', 'VP of Marketing',
  'Digital Marketing Manager', 'Performance Marketing Manager', 'Growth Manager',
  'Brand Manager', 'Content Manager', 'Content Strategist', 'Content Writer',
  'Copywriter', 'SEO Specialist', 'SEO Manager', 'SEM Specialist',
  'Social Media Manager', 'Community Manager', 'Influencer Marketing Manager',
  'Email Marketing Manager', 'CRM Manager', 'Marketing Analyst',
  'PR Manager', 'Communications Manager', 'Public Relations Specialist',
  'Graphic Designer', 'Visual Designer', 'Art Director', 'Creative Director',
  'Video Producer', 'Videographer', 'Photographer',

  // Sales & Business Development
  'Sales Manager', 'Head of Sales', 'VP of Sales', 'Sales Director',
  'Account Executive', 'Account Manager', 'Key Account Manager',
  'Business Development Manager', 'Business Development Representative',
  'Sales Development Representative', 'SDR', 'BDR',
  'Customer Success Manager', 'Customer Success Lead',
  'Enterprise Sales Manager', 'Inside Sales Representative',
  'Sales Engineer', 'Pre-Sales Consultant', 'Solutions Engineer',
  'Partnerships Manager', 'Channel Manager',

  // Operations & Management
  'Operations Manager', 'Head of Operations', 'COO',
  'Project Manager', 'Senior Project Manager', 'Programme Manager',
  'General Manager', 'Office Manager', 'Executive Assistant',
  'CEO', 'Managing Director', 'Country Manager', 'Regional Manager',
  'Supply Chain Manager', 'Logistics Manager', 'Procurement Manager',
  'Warehouse Manager', 'Inventory Manager', 'Fleet Manager',
  'Facilities Manager', 'Health and Safety Manager',

  // Human Resources
  'HR Manager', 'Head of HR', 'HR Director', 'HR Business Partner',
  'Recruiter', 'Talent Acquisition Manager', 'Talent Acquisition Specialist',
  'Technical Recruiter', 'HR Generalist', 'People Operations Manager',
  'Learning and Development Manager', 'Compensation and Benefits Manager',
  'Payroll Manager', 'HR Coordinator',

  // Customer Support
  'Customer Support Manager', 'Customer Service Manager', 'Head of Support',
  'Support Engineer', 'Technical Support Specialist', 'Customer Support Specialist',
  'Help Desk Technician', 'IT Support Specialist',

  // Engineering (non-software)
  'Civil Engineer', 'Structural Engineer', 'Mechanical Engineer',
  'Electrical Engineer', 'Chemical Engineer', 'Aerospace Engineer',
  'Environmental Engineer', 'Geotechnical Engineer', 'Process Engineer',
  'Manufacturing Engineer', 'Quality Engineer', 'Automation Engineer',
  'Robotics Engineer', 'Embedded Systems Engineer',
  'Architect', 'Urban Planner', 'Quantity Surveyor', 'Site Manager',
  'Construction Manager', 'Project Engineer',

  // Education
  'Teacher', 'Primary School Teacher', 'Secondary School Teacher',
  'Maths Teacher', 'English Teacher', 'Science Teacher', 'Language Teacher',
  'Professor', 'Lecturer', 'Research Fellow', 'Researcher',
  'School Principal', 'Academic Advisor', 'Curriculum Developer',
  'Tutor', 'Teaching Assistant', 'Special Education Teacher',
  'Corporate Trainer', 'Instructional Designer', 'E-Learning Developer',

  // Trades & Skilled Labour
  'Electrician', 'Plumber', 'Carpenter', 'Welder', 'Mechanic',
  'HVAC Technician', 'Painter', 'Mason', 'Bricklayer', 'Roofer',
  'Pipefitter', 'Machinist', 'CNC Operator', 'Maintenance Technician',

  // Hospitality & Tourism
  'Hotel Manager', 'Restaurant Manager', 'Chef', 'Head Chef', 'Sous Chef',
  'Pastry Chef', 'Waiter', 'Bartender', 'Sommelier',
  'Tour Guide', 'Travel Agent', 'Event Planner', 'Event Manager',
  'Concierge', 'Front Desk Manager', 'Housekeeping Manager',

  // Real Estate
  'Real Estate Agent', 'Real Estate Manager', 'Property Manager',
  'Letting Agent', 'Mortgage Advisor', 'Surveyor', 'Valuer',

  // Creative & Media
  'Journalist', 'Editor', 'Sub-Editor', 'Producer', 'Director',
  'Scriptwriter', 'Game Designer', 'Game Developer', 'Animator',
  '3D Artist', 'Motion Designer', 'Audio Engineer', 'Sound Designer',

  // Science & Research
  'Biologist', 'Biochemist', 'Chemist', 'Physicist', 'Geologist',
  'Environmental Scientist', 'Clinical Research Associate', 'Lab Scientist',
  'Biomedical Scientist', 'Epidemiologist',
]

export const LOCATIONS = [
  // Special
  'Remote', 'Worldwide', 'Anywhere', 'Hybrid',

  // Africa
  'Morocco', 'Egypt', 'Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana',
  'Tanzania', 'Algeria', 'Sudan', 'Uganda', 'Ivory Coast', 'Cameroon', 'Senegal',
  'Tunisia', 'Rwanda', 'Zambia', 'Zimbabwe', 'Mozambique', 'Madagascar',
  // African cities
  'Casablanca', 'Rabat', 'Marrakech', 'Fez', 'Tangier',
  'Cairo', 'Alexandria', 'Lagos', 'Abuja', 'Cape Town', 'Johannesburg', 'Durban',
  'Nairobi', 'Accra', 'Addis Ababa', 'Tunis', 'Algiers', 'Kigali', 'Dakar',

  // Europe
  'United Kingdom', 'Germany', 'France', 'Netherlands', 'Spain', 'Italy',
  'Portugal', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Switzerland',
  'Austria', 'Belgium', 'Ireland', 'Poland', 'Czech Republic', 'Hungary',
  'Romania', 'Greece', 'Turkey', 'Ukraine', 'Russia', 'Serbia', 'Croatia',
  'Slovakia', 'Slovenia', 'Bulgaria', 'Estonia', 'Latvia', 'Lithuania',
  'Luxembourg', 'Malta', 'Cyprus', 'Iceland',
  // European cities
  'London', 'Berlin', 'Paris', 'Amsterdam', 'Madrid', 'Barcelona', 'Milan', 'Rome',
  'Lisbon', 'Porto', 'Stockholm', 'Oslo', 'Copenhagen', 'Helsinki', 'Zurich', 'Geneva',
  'Vienna', 'Brussels', 'Dublin', 'Warsaw', 'Prague', 'Budapest', 'Bucharest',
  'Athens', 'Istanbul', 'Kyiv', 'Moscow', 'Munich', 'Hamburg', 'Frankfurt',
  'Lyon', 'Marseille', 'Toulouse', 'Rotterdam', 'The Hague', 'Eindhoven',

  // North America
  'United States', 'Canada', 'Mexico',
  // US cities
  'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Austin', 'Seattle',
  'Boston', 'Denver', 'Miami', 'Atlanta', 'Washington DC', 'Houston', 'Dallas',
  'San Diego', 'Portland', 'Minneapolis', 'Phoenix', 'Las Vegas', 'Nashville',
  'New York City', 'Silicon Valley', 'Bay Area',
  // Canadian cities
  'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton',
  // Mexican cities
  'Mexico City', 'Guadalajara', 'Monterrey',

  // South America
  'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Uruguay', 'Ecuador', 'Venezuela',
  'São Paulo', 'Rio de Janeiro', 'Buenos Aires', 'Bogotá', 'Santiago', 'Lima', 'Medellín',

  // Asia
  'India', 'China', 'Japan', 'South Korea', 'Singapore', 'UAE', 'Saudi Arabia',
  'Israel', 'Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines',
  'Pakistan', 'Bangladesh', 'Sri Lanka', 'Taiwan', 'Qatar', 'Kuwait',
  'Bahrain', 'Jordan', 'Lebanon',
  // Asian cities
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata',
  'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 'Chengdu', 'Hangzhou',
  'Tokyo', 'Osaka', 'Seoul', 'Singapore City', 'Hong Kong', 'Taipei',
  'Dubai', 'Abu Dhabi', 'Riyadh', 'Tel Aviv',
  'Jakarta', 'Kuala Lumpur', 'Bangkok', 'Ho Chi Minh City', 'Hanoi', 'Manila',

  // Oceania
  'Australia', 'New Zealand',
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Auckland', 'Wellington',
]
