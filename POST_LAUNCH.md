# POST-LAUNCH FEATURES
> Everything intentionally deferred from V1. Claude Code must NOT build these now.
> Last updated: 2026-09-30

---

## RULE
If a feature is on this list, do not build it — even if it seems simple. The goal is to launch with a tight, correct V1. Features get added when the core loop is working and users are real.

---

## OPPORTUNITY ENGINE

### Email / calendar integration for outcome inference
- Detecting interview invites from email
- Auto-updating application status from calendar events
- V1 outcome tracking is entirely manual

### Active hiring signals
- Real-time "Actively hiring" detection from LinkedIn or job data providers
- Hiring spike indicators
- Competition level / applicant count signals
- These require data sources not yet integrated and cannot be fabricated

### ATS compatibility scoring
- Detecting whether a resume will pass through an ATS
- Resume keyword density analysis against job description

### Multi-source job aggregation
- Beyond the initial job data source
- Deduplication pipeline for multi-source results

---

## APPLICATIONS PAGE

### Email / calendar auto-status updates
- Parsing inbox to detect "interview invitation" or "rejection" emails
- Auto-moving applications to Interview or Declined status

### Outreach tracking
- Follow-up reminders after applying
- "Did you hear back?" nudges

### Application analytics
- Charts showing success rates by company type, role, industry
- Time-to-response stats

---

## SEARCHES PAGE

### Market intelligence per search
- "X new roles appeared this week in Fintech UK" insights
- Hiring trend overlays
- Competitive market signals

### Search performance analytics
- Match rate over time
- Which search generates the best shortlists
- Charts, sparklines, metrics per search card

---

## PROFILE & PREFERENCES

### Behavioral signal accumulation
- Learning from which opportunities the user opens, dismisses, applies to
- This is designed into the preference hierarchy but not collected in V1
- V1 only uses explicit onboarding preferences

### Smart preference update prompts
- "You've dismissed 3 Product roles — should we update your preferences?"
- Post-launch when behavioral data exists

---

## NETWORKING & REFERRALS

### "Know anyone at this company?" matching
- LinkedIn connection surface
- Warm intro suggestions

### Referral tracking
- Who referred whom to Careerely

---

## "NOT FOR ME" LEARNING
> The dismiss reason collection ("Role / Company / Location / Salary / Industry / Other") is designed into the Opportunities page but collecting that data and training the engine on it is post-launch. In V1, the reason picker improves UX even if we don't act on it immediately.

---

## MOBILE APP
- Native iOS / Android app
- Push notifications for new picks, prepared applications
- V1 is web-only (responsive)

---

## ENTERPRISE / TEAMS
- Multi-seat accounts
- Recruiter-side dashboard
- Bulk resume parsing
- White-label / API access

---

## CONTENT FEATURES

### Career coach mode
- AI-powered interview prep based on upcoming interviews in the system
- "You have an interview at Stripe on Monday — here's what to prepare"

### Salary negotiation guidance
- Compensation benchmarking
- Counter-offer scripts

### Profile optimization
- LinkedIn profile rewrite suggestions based on target roles

---

## ADVANCED MATCHING

### Company culture fit scoring
- Glassdoor / Blind sentiment integration
- Culture keyword matching

### Compensation benchmarking
- Levels.fyi / Glassdoor salary data integration
- Automatic salary floor matching against minimum compensation preference

---

## INTEGRATIONS

### LinkedIn OAuth
- Importing work history directly from LinkedIn
- "Apply with LinkedIn" shortcut

### Google / Outlook calendar
- Interview scheduling from within Careerely

### Notion / Obsidian export
- Exporting application log to personal productivity tools

---

## NOTES FOR CLAUDE CODE

1. If you encounter a code path that would require any of the above, add a `// TODO: POST-LAUNCH` comment and stub it with a placeholder. Do not build the feature.

2. The data schema should be designed to accommodate post-launch features (e.g., the behavioral signal table should exist but not be populated in V1) — but no UI or logic should depend on them.

3. The preference hierarchy (explicit > behavioral > interaction history) is the correct long-term design. In V1, only the explicit onboarding preferences layer is active.
