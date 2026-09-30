// Terms of Service and Privacy Policy, verbatim from
// design/onboarding-step1-step2-final.html (the prototype's final MODAL_CONTENT).
// **text** marks bold. Kept as data so the modal renders without innerHTML.

export type LegalBlock = { heading?: string; paragraphs: string[] }
export type LegalDoc = { title: string; updated: string; blocks: LegalBlock[] }

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: 'Last updated: June 2026',
  blocks: [
    {
      paragraphs: [
        'Careerely is an AI-powered career platform that helps ambitious professionals discover relevant opportunities and generate tailored resumes and cover letters. These Terms govern your use of our platform. They are written to be read, not avoided.',
      ],
    },
    {
      heading: 'Who Can Use Careerely',
      paragraphs: [
        'You must be at least 18 years old and legally permitted to enter into contracts in your country. By using Careerely, you confirm this is true.',
      ],
    },
    {
      heading: 'Your Account',
      paragraphs: [
        'You are responsible for keeping your account credentials secure and for everything that happens under your account. Use accurate information when signing up. Each user may maintain one personal account.',
      ],
    },
    {
      heading: 'What Careerely Is — and Is Not',
      paragraphs: [
        'Careerely is a technology platform. We are not a recruiter, employment agency, or career counsellor. We do not represent you to employers, and we do not guarantee interviews, job offers, or any specific outcome. Job search results depend on factors entirely outside our control.',
      ],
    },
    {
      heading: 'AI-Generated Content',
      paragraphs: [
        'Careerely uses AI to generate tailored resumes and cover letters based on your uploaded resume and job preferences. This content is assistive — it is a starting point, not a final product.',
        'You must review all AI-generated content before submitting it to any employer. AI can make mistakes. You are solely responsible for the accuracy of anything you submit in your name. Do not submit applications containing information that is false, misleading, or that you have not verified.',
      ],
    },
    {
      heading: 'Your Resume and Content',
      paragraphs: [
        'You own your resume and any content you upload. By uploading it, you grant us a limited, non-exclusive licence to process it solely for the purpose of providing the Service, including generating relevant job matches, tailored resumes, and cover letters. We do not sell your content or use it to train public or third-party AI models.',
        'You are responsible for ensuring your resume is accurate. Inaccurate information in your resume may result in inaccurate AI outputs. Careerely is not liable for consequences arising from inaccuracies in content you provide.',
      ],
    },
    {
      heading: 'Acceptable Use',
      paragraphs: [
        'You agree not to use Careerely to submit false or fraudulent job applications, impersonate others, scrape or copy our platform, or use the service for any purpose other than your own personal job search. Commercial use requires our written consent.',
      ],
    },
    {
      heading: 'Subscriptions and Billing',
      paragraphs: [
        "Paid plans are billed monthly in advance. You authorise us to charge your payment method at the start of each billing cycle. Prices are shown on our pricing page and may change with 30 days' notice.",
      ],
    },
    {
      heading: 'Cancellation and Refunds',
      paragraphs: [
        'You can cancel anytime from your account settings. Cancellation takes effect at the end of your current billing period — you keep access until then. We do not offer refunds for partial months except where required by law. EU and UK users retain their statutory cancellation rights.',
      ],
    },
    {
      heading: 'Third-Party Services',
      paragraphs: [
        'Careerely pulls job listings from third-party sources. We do not control these listings and cannot guarantee that they are accurate, current, or legitimate. We are not responsible for the content of external job boards or employer websites.',
      ],
    },
    {
      heading: 'Intellectual Property',
      paragraphs: [
        'Everything we build — the platform, design, software, and brand — belongs to Careerely. Your subscription gives you a personal, non-transferable right to use the service. You may not copy, reverse engineer, resell, or build competing products based on the platform or underlying technology.',
      ],
    },
    {
      heading: 'Service Availability',
      paragraphs: [
        'We aim to keep Careerely available and reliable, but we do not guarantee uninterrupted access. Features may be added, modified, or discontinued as the platform evolves.',
      ],
    },
    {
      heading: 'Limitation of Liability',
      paragraphs: [
        'To the fullest extent permitted by law, Careerely is not liable for employment outcomes, losses arising from AI-generated content, third-party service failures, or indirect or consequential damages of any kind. Our total liability to you will not exceed the fees you paid us in the 12 months before the claim.',
      ],
    },
    {
      heading: 'Suspension and Termination',
      paragraphs: [
        'You can delete your account at any time. We may suspend or terminate accounts that violate these Terms. On termination, your right to use the platform ends and we will delete your data in accordance with our Privacy Policy.',
      ],
    },
    {
      heading: 'Changes to These Terms',
      paragraphs: [
        "We may update these Terms. For material changes, we will give you at least 30 days' notice by email. Continued use after the effective date means you accept the update.",
      ],
    },
    {
      heading: 'Events Outside Our Control',
      paragraphs: [
        'Careerely is not responsible for delays, interruptions, or failures caused by events beyond our reasonable control, including internet outages, cloud provider failures, cyberattacks, natural disasters, government actions, or failures of third-party services.',
      ],
    },
    {
      heading: 'Governing Law',
      paragraphs: [
        'These Terms are governed by the laws of Norway. Disputes will be resolved in the courts of Oslo, Norway, except where mandatory local consumer law provides otherwise.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: ['Questions about these Terms? Contact us at **hello@careerely.ai**.'],
    },
  ],
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'Last updated: June 2026',
  blocks: [
    {
      paragraphs: [
        'We take privacy seriously. This policy explains what data we collect, why we collect it, how we use it, and what rights you have. It is written to be understood, not buried.',
      ],
    },
    {
      heading: 'Who We Are',
      paragraphs: [
        'Careerely is the data controller for the personal information described in this Policy. For questions about this Policy, contact us at **hello@careerely.ai**.',
      ],
    },
    {
      heading: 'What We Collect',
      paragraphs: [
        '**Information you give us:** your name, email address, password, resume content, work history, skills, job preferences, and target roles.',
        '**Information we generate:** job matches, tailored resumes, and cover letters created from your data.',
        '**Usage data:** how you interact with the platform, features you use, pages you visit, and device and browser information.',
        '**Payment data:** handled by our payment processor. We store only a token reference — never your full card details.',
      ],
    },
    {
      heading: 'Why We Use It',
      paragraphs: [
        'We use your data to provide, maintain, and improve the service, including generating relevant job matches, tailored resumes, and cover letters, improving platform reliability, preventing abuse, and enhancing the user experience. We also use it to send you service notifications, billing communications, and — with your consent — product updates.',
        'We never sell your data. We never use your data to train public or third-party AI models. Your resume and personal information are used solely to operate the service for you.',
      ],
    },
    {
      heading: 'Legal Basis for Processing (GDPR)',
      paragraphs: [
        'If you are in the EU or UK, we process your data under the following legal bases: **contract** (to provide the service you signed up for), **legitimate interests** (to improve the platform and prevent abuse), and **consent** (for marketing communications, which you can withdraw at any time).',
      ],
    },
    {
      heading: 'AI Processing',
      paragraphs: [
        'Your resume and preferences are processed by AI to generate tailored applications. This processing is assistive — a human (you) reviews and approves all outputs before they are used. Under GDPR Article 22, you have the right not to be subject to solely automated decisions with significant effects. Our service is designed with human review as a required step.',
      ],
    },
    {
      heading: 'Who We Share Data With',
      paragraphs: [
        'We share data only with trusted service providers who help us operate the platform, such as infrastructure providers, AI processing services, payment processors, and email delivery services. All providers are bound by data processing agreements and confidentiality obligations.',
        'We do not share your data with employers, recruiters, or job boards. We do not sell your data to third parties for advertising or any other purpose.',
      ],
    },
    {
      heading: 'International Transfers',
      paragraphs: [
        'We may transfer data to service providers located outside the EU or UK. Where we do, we use Standard Contractual Clauses (SCCs) or equivalent safeguards approved under GDPR. You can request details of these safeguards by contacting hello@careerely.ai',
      ],
    },
    {
      heading: 'How Long We Keep Your Data',
      paragraphs: [
        'We keep your account data for as long as your account is active. If you delete your account, we delete your personal data within 30 days, except where we are required by law to retain it longer. Anonymised, aggregated data may be retained indefinitely.',
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'Your data is encrypted in transit and at rest. We use industry-standard access controls and monitor our systems for unusual activity. No system is perfectly secure, but we take reasonable steps to protect yours.',
      ],
    },
    {
      heading: 'Cookies',
      paragraphs: [
        'We use essential cookies to keep you signed in and remember your preferences. We use analytics cookies to understand how the platform is used. We do not use advertising or tracking cookies. You can manage cookie preferences in your browser settings.',
      ],
    },
    {
      heading: 'Your Rights',
      paragraphs: [
        'Depending on where you are located, you have the right to access, correct, export, or delete your personal data. EU and UK users also have the right to object to processing, restrict processing, and withdraw consent at any time.',
        'To exercise any of these rights, go to your account settings or contact us at **hello@careerely.ai**. We will respond within 30 days.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: ['Careerely is not intended for users under 18. We do not knowingly collect data from minors.'],
    },
    {
      heading: 'Changes to This Policy',
      paragraphs: [
        'We may update this policy. For significant changes, we will notify you by email at least 30 days before they take effect.',
      ],
    },
    {
      heading: 'Contact and Complaints',
      paragraphs: [
        'For privacy questions: **hello@careerely.ai**',
        'If you are in the EU or UK and believe we have not handled your data correctly, you have the right to lodge a complaint with your local data protection authority.',
      ],
    },
  ],
}
