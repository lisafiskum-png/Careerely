# CAREERELY — MASTER BRIEF
> Source of truth for Claude Code implementation. Latest decision wins throughout.
> Last updated: 2026-09-30

---

## 1. WHAT CAREERELY IS

Careerely is an **AI career agent** — not a job board. It does the searching, evaluating, and preparing so the user only does the reviewing and applying.

**Core loop:**
Upload resume → Careerely finds, evaluates, and prioritises jobs → tailors resume and cover letter for each → user reviews and applies

**What makes it different from a job board:**
- Careerely acts on your behalf while you're not logged in
- It makes a recommendation ("My Pick"), not a neutral list
- Applications are prepared automatically — the user's job is review, not search
- Every claim traces to stored evidence. Nothing is invented.

**Domain:** careerely.ai  
**Support email:** hello@careerely.ai  

---

## 2. TARGET USER

**Primary:** Professionals actively looking to change jobs who have limited time to spend on job searching — they want Careerely to do the work while they get on with their lives.

**Demo persona (used in all UI/prototypes):**
- Name: Lisa Fiskum
- Background: AML compliance professional at a Nordic bank
- Transitioning into: sales and business development in fintech, crypto, and AI-native companies
- Target companies: Stripe, Ramp, Shopify, Nubank, Criteo, Snowflake, Databricks, Cohere

---

## 3. CORE VALUE PROPOSITION

> "Stop searching for jobs. Careerely searches for you."

Careerely finds the opportunities worth your attention and prepares tailored applications while you focus on what comes next.

---

## 4. TECH STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js |
| Database + Auth | Supabase |
| Hosting | Vercel |
| Payments | Stripe |
| AI | Claude API — `claude-sonnet-4-6` |
| Company logos | Clearbit logo API (with branded-color letter fallbacks) |

**Clearbit note:** Clearbit sunsets Dec 2025. All logo display must use the letter-fallback system with branded hex colors as the permanent fallback. Never depend on Clearbit being available.

---

## 5. PRICING (LOCKED)

| Plan | Price | Active Searches | Applications Prepared/mo |
|------|-------|-----------------|--------------------------|
| Basic | $29/mo | 1 | 10 |
| Pro | $49/mo | 5 | 50 |
| Max | $79/mo | Unlimited | 200 |

**Rules:**
- Unit of value = **applications prepared** (not opportunities discovered)
- Opportunity caps are eliminated — every plan sees all shortlisted opportunities
- Automatic preparation (top 2 nightly) is **consistent across all tiers**
- Searches beyond the plan limit are saved as paused, never silently downgraded without user awareness

---

## 6. USER JOURNEY (COMPLETE)

```
Landing page
    ↓
Sign up (Step 1)
    ↓
Resume upload + AI parsing (Step 2)
    ↓
"Your next move" — set preferences (Step 3)
    ↓
Dashboard — daily brief, My Pick, shortlist
    ↓
Opportunities — full shortlisted list, My Pick featured
    ↓
Applications — prepared applications + tracking
    ↓
Searches — manage active search missions
```

---

## 7. ONBOARDING FLOW

### Step 1 — Account creation
**Status: Complete (HTML finalized)**
- Standard: name, email, password
- File: `design/onboarding-step1-final.html`

### Step 2 — Resume upload
**Status: Complete (HTML finalized)**
- Architecture: state machine — upload → parsing → review
- Claude API parses the resume and returns structured data
- Editable review screen: user can correct every extracted field
- File: `design/onboarding-step2-final.html`

### Step 3 — "Your next move"
**Status: Spec locked, HTML in progress**
- File: `design/onboarding-step3-wip.html` (working file; needs final polish)

**Exact locked copy:**
- Headline: `"Your next move"`
- Subtitle: `"We've built your professional profile. Now let's personalise your search."`
- Helper text: `"Suggested from your resume. Edit if needed."`
- Footer: `"We'll combine your experience with your preferences to find better matches and tailor every application."`
- CTA button: `"Find my matches"`

**Section 1 — Your goals:**
- Desired roles (up to 3) — search-and-select, AI-prefilled from resume
- Industries & domains (up to 5) — same pattern
- Chips animate in with staggered analyzing sequence on load

**Section 2 — Preferences:**
- Work style: multi-select pills — On-site / Hybrid / Remote
- Preferred locations: optional search field

**Submit sequence:**
1. Form fades out
2. Full-screen transition with 4 sequential checkmarks
3. Success screen: summary card of selected preferences + Edit button

---

## 8. OPPORTUNITY ENGINE (LOCKED SCHEMA)

### The 7 stages
1. **Hard eligibility filtering** — removes fundamentally mismatched roles
2. **Relevance evaluation** — scores fit against resume and profile
3. **Multi-dimensional scoring** — composite across skills, experience, location, salary, industry
4. **Goal-alignment-gated ranking** — goal alignment gates final rank regardless of fit score
5. **Evidence storage** — every claim stored as a traceable evidence record
6. **Preparation decision** — decides which opportunities to spend preparation quota on
7. **Application package generation** — tailors resume + writes cover letter

### Invariants (never violate)
- Every UI claim must trace to a stored evidence record
- Absence of evidence = `"unknown"` — **never** `"negative"`
- Inferred claims are judgment, not fact; no metrics may be invented
- Goal alignment gates final ranking regardless of fit score
- Rejected opportunities are logged, never silently dropped
- Full TypeScript schema covers: signal types, requirement evaluations, composite scores, ranking factors, resume changes, cover letter segments

### Opportunity states (three, distinct)
| State | Meaning |
|-------|---------|
| **Shortlisted** | Careerely recommends it; no preparation quota spent |
| **Preparing** | Selected for preparation; resume/cover letter being created |
| **Ready** | Preparation complete; moves to Applications |

**Preparing ≠ unavailable.** A preparing opportunity can still be opened and reviewed. Never show a time estimate (`~5 min`) — just `"Preparing application…"`

### Preference precedence
1. Explicit onboarding preferences (highest — immediate and authoritative)
2. Behavioral signals (accumulate gradually from usage patterns)
3. Interaction history (lowest weight)

### Automatic preparation
Top 2 opportunities prepared automatically each night — consistent across all pricing tiers.

---

## 9. DASHBOARD

**Status: Design locked, motion pass complete**  
**File:** `design/dashboard-final.html`

### Layout
- Left sidebar navigation (sticky, 220px)
- Main content area: single-column vertical composition
- Wide viewport, not centered-narrow

### Structure (top to bottom)
1. Dynamic greeting — `GOOD MORNING/AFTERNOON/EVENING, LISA.` (time-based, uppercase)
2. Stat line — `6 shortlisted · 2 ready · 2,143 reviewed · last scan 3 min ago`
3. **My Pick** — editorial centerpiece; large company card
4. **Shortlist** — borderless rows, hairline separators
5. **Applications Ready** — completed prep handed to user
6. **Recent Activity** — quiet log

### My Pick card
- Large role name + company name + logo
- 95% match displayed as a large number (no gauge/ring/progress bar)
- Two strongest evidence points only (not three+)
- Careerely reasoning paragraph
- "Review application" button (not "Apply")
- Completion chips: quiet indicators, not bold pills

### Shortlist rows
- Borderless with hairline separators
- Logo · Role · Location · Match % · Arrow (hover)
- No "I'd look at this" or "Worth reviewing" labels on individual rows
- Match percentage is sufficient
- "Not for me" dismiss on hover (for Shortlisted rows that don't have prepared applications)

### Applications Ready
- Rows show: company, role, "Application complete" state
- Primary action: "Review" — not "Apply"
- Shows completed work Careerely is handing to the user

### Recent Activity
- Quiet rows, no decorations
- Label: "Recent activity" (not "Careerely worked while you were away")

### Motion language (locked)
**Load sequence:**
1. Header + stats count up from 0 (reviewed: 1,100ms; shortlisted: 700ms; apps: 500ms)
2. My Pick card reveals
3. Shortlist rows stagger in (70ms per row)

**Scroll reveals:** Applications and Activity sections reveal via IntersectionObserver (threshold 0.05)

**Match bars:** Animate from 0% to target value after pick card reveals (not on page load)

**Dismissal:** Smooth collapse — opacity + translateX + max-height all transition; counts cascade with fade to new value

**Panel open:** Pulse ring animates from source row to connect the click to the panel appearing

**Background:** Two static gradient orbs (no drift, no animation). `--bg: #F5F4F1`. White used only for the My Pick card. No dot grids, no animated glows.

**Ease token:** `cubic-bezier(0.22, 1, 0.36, 1)`

### State consistency rules
- Any opportunity with "Application ready" state → must appear in both shortlist AND Applications Ready
- Ramp: "Application ready" badge in shortlist; no dismiss button; appears in Applications Ready
- Shopify, Criteo, Nubank: dismissable ("Not for me" on hover)
- Nav badge = 1 (My Pick) + visible shortlist row count

### Company logos — branded hex fallbacks
| Company | Hex |
|---------|-----|
| Shopify | `#96BF48` |
| Ramp | `#1C1C1C` |
| Criteo | `#FF6B35` |
| Nubank | `#820AD1` |
| Snowflake | `#29B5E8` |
| Databricks | `#FF3621` |
| Stripe | `#6C47FF` |
| Cohere | `#D4531A` |

---

## 10. OPPORTUNITIES PAGE

**Status: Direction correct, fixes required before locking**  
**File:** `design/opportunities-wip.html`

### What's correct and must be kept
- Hierarchy: 6 total → **My Pick** (featured, more weight) → **Also shortlisted** (compact rows)
- My Pick: 95% match, evidence chips, Careerely reasoning, prepared application state
- Detail panel: tabs — "Why I picked this" / "What Careerely changed" / "Things I considered"
- Match percentages and evidence chips on all rows
- "Not for me" dismiss interaction
- "Reviewed 2,143 new postings" header stat (only if backed by real data)

### Required fixes before locking
1. **Separate the three states properly.** `prepared:false` must NOT auto-mean "Preparing." Show:
   - Shortlisted → no prep indicators, panel shows "Application not prepared yet"
   - Preparing → panel shows in-progress state; row still clickable/reviewable
   - Ready → row shows "Application ready" badge

2. **Preparing ≠ unavailable.** Cohere (Preparing) must still be clickable. Remove `~5 min` estimates.

3. **Remove "I'd look at this" / "Worth reviewing"** from non-pick rows. Match + evidence + state + Review button is enough.

4. **"Not for me" should teach the engine.** After dismiss, offer optional quick reason:
   `Role · Company · Location · Salary · Industry · Other`
   Not mandatory. Dismiss instantly works without it.

5. **Empty state:** Only shows "You're all caught up" when ALL opportunities (including My Pick) are dismissed. My Pick has no dismiss on the main card — only via the panel overflow menu.

6. **Per-opportunity content.** Every opportunity needs its own: role description, requirements list, evidence items. Never reuse generic content across companies.

7. **Canonical time window: last 7 days** for all activity metrics on this page.

---

## 11. APPLICATIONS PAGE

**Status: Product model locked, page not yet built**

### Definition
- **Opportunities** = jobs Careerely thinks are worth attention
- **Applications** = jobs where Careerely has completed an application + jobs subsequently submitted

### Page structure
**Section 1 — Ready to apply** (top, visually prioritized)
- Applications Careerely prepared that need user action
- Primary CTA: "Review application" / "Continue to application"

**Section 2 — Your applications** (below)
- Submitted applications with: status chip, company, role, applied date, lightweight status update control

### Four core statuses
| Status | Meaning |
|--------|---------|
| Ready to apply | Application prepared; awaiting user |
| Applied | User confirmed submission |
| Interview | User updated manually |
| Offer | User updated manually |

**Closed outcomes (not pipeline stages):** Declined · Withdrawn  
**Never use:** "No response" as a status  
**Never build:** Kanban board, ATS pipeline, CRM features

### V1 constraints
- Outcome tracking is **manual** — Careerely does not auto-infer outcomes from email or calendar in V1
- Clicking an external application link does **not** auto-mark as Applied
- After clicking external link, show: `"Did you apply?" → Yes, I applied`
- Only then does status become `Applied`
- Nav badge = count of applications in "Ready to apply" state

### Product psychology
The Applications page is a **record of work Careerely has done**. `"12 applications prepared · 8 applied · 2 interviews"` makes the agent's value tangible without needing analytics widgets.

---

## 12. SEARCHES PAGE

**Status: Direction correct, fixes required before locking**  
**File:** `design/searches-wip.html`

### What's correct and must be kept
- Page answers: "What is Careerely hunting for on my behalf?"
- Shows active/paused missions — not job listings
- Plan usage bar: `X of 5 active searches · Pro plan` (counts only `status === active`)
- Search cards: Active/Paused, parameters, reviewed count, shortlisted count, last scan
- "Created from your preferences" label
- Edit modal note: `"Changes apply to this search only and will not affect your Career Profile."`
- Activity metrics: 1,842 + 301 = 2,143 reviewed / 4 + 2 = 6 shortlisted (intentional, consistent across views)
- Pause/resume respecting active-search limit

### Required fixes before locking
1. **Custom chip input.** Career Profile suggestions appear first as suggested chips. User can add custom Target Roles, Industries, and Locations. Work style (Remote/Hybrid/On-site) stays fixed options only.

2. **Add minimum compensation.** Optional field per search. Inherits from Career Profile if blank. Understated placement — not a prominent salary filter UI. Example: `"Minimum compensation (optional)" £70,000 — Leave blank to use your Career Profile preference.`

3. **Canonical time window: last 7 days** for all search activity metrics. Dashboard/Opportunities should use compatible language.

4. **Two distinct empty states:**
   - Zero saved searches → `"No searches yet"` + prompt to create first search
   - Searches exist but all are paused → show cards + banner: `"Careerely isn't currently searching. Resume a search below to start scanning the market again."`

5. **Plan limit transparency.** At 5/5 active searches:
   - Never silently create a paused search after user clicks "Start search"
   - CTA changes to: `"Save as paused"` with explanation: `"You've reached 5 active searches. This search will be saved as paused."`
   - OR after clicking Start: show modal `"You've reached your active search limit. Pause another search or save this one as paused."`

---

## 13. LANDING PAGE

**Status: Concept approved, not yet built as final HTML**

### Hero copy (approved)
```
Stop searching for jobs.
Careerely searches for you.

Careerely finds the opportunities worth your attention and
prepares tailored applications while you focus on what comes next.

[Get Started →]
```

### Scroll-driven product demo (approved concept)
- Hero and demo are **one unified experience** — not separate sections
- Immediately below the CTA, user sees the top of the Careerely dashboard
- Dashboard is **1000–1200px wide** on desktop — nearly full-screen; not a small browser mockup
- As user scrolls, the product enters the viewport and demo sequence starts
- **Scroll drives the story:**
  - Scanning the market…
  - Counter: 386 reviewed → 1,247 reviewed → 2,143 reviewed
  - 6 shortlisted
  - MY PICK → Stripe → Business Development Lead → 95% match
  - Evidence chips appear one by one: ✓ AML compliance experience, ✓ Enterprise sales, ✓ Location aligned
  - Preparing application… → Resume tailored ✓ → Cover letter prepared ✓
  - "Why I picked this" panel opens
- **Mobile:** simpler sequence, not compressed desktop layout
- **Not clickable** — landing page controls the narrative; real interactivity begins after sign-up

### Proposed page structure
1. Hero (with scroll-into-demo CTA)
2. Live product experience (scroll-driven demo)
3. Brief "How Careerely works" (demo makes this much lighter)
4. Not another job board
5. Trust / evidence / social proof
6. Pricing
7. Final CTA

### What NOT to do on landing page
- No small "fake browser" 700×400px mockup with cursor clicking around — too generic SaaS
- No perspective-tilt gimmick on the product screenshot
- No video — this is HTML/CSS/JS so it reacts to scroll (better than video)

---

## 14. AI BEHAVIOR RULES (LOCKED)

### Voice
- First-person agent opinions: `"I'd start here"`, `"My pick"`
- The agent speaks with a point of view — confident but honest
- No obsequious filler: no "Great opportunity!" or "This looks exciting!"

### What Careerely must NEVER fabricate (in production)
- "Actively hiring" signals
- Number of applicants / competition level
- Hiring spikes or urgency indicators
- ATS scores
- Market signals (unless from verified real-time data source)
- Any metric that answers a question Careerely cannot actually answer

**Exception:** Mockup/prototype UI is exempt — demo data can include these for illustration.

### Three-state signal rule
- Evidence present → show it
- Evidence absent → `"unknown"` — never assume negative
- Inferred claims → clearly marked as judgment, not fact

### Every claim must answer: "How do we know this?"

---

## 15. VOCABULARY (LOCKED)

| Use | Not |
|-----|-----|
| Opportunities | ~~Matches~~ |
| Worth reviewing / My pick | ~~Good match / Strong match~~ |
| Find my opportunities (general CTA) | ~~Find my matches~~ |
| Find my matches | ← Exception: Step 3 onboarding CTA only |
| Recent activity | ~~Careerely worked while you were away~~ |
| Ready to apply | ~~Application ready~~ (in Applications page) |
| Application complete | ~~Application ready~~ (in Applications Ready panel on Dashboard) |
| Preparing application… | ~~~5 min~~ / ~~Application being prepared~~ |

---

## 16. VISUAL DESIGN SYSTEM (LOCKED)

### Color tokens
```css
--bg:     #F5F4F1   /* warm neutral background */
--white:  #FFFFFF   /* My Pick card only */
--ink:    #0E0E0E
--ink2:   #2C2C2C
--ink3:   #5A5A5A
--ink4:   #8C8C8C
--ink5:   #C0C0C0
--line:   rgba(0,0,0,.08)
--line2:  rgba(0,0,0,.05)
--pu:     #4B32B8   /* primary purple — CTAs, match %, accents */
--pu-s:   rgba(75,50,184,.06)
--gn:     #1A7A4A   /* green — completion, success states */
--gn-s:   rgba(26,122,74,.07)
--ease:   cubic-bezier(0.22,1,0.36,1)
```

### Typography
- Font: **Inter**, all weights, optical sizing 14–32
- Feature settings: `"ss01","cv01","cv11","cv08"`
- Anti-aliasing: `-webkit-font-smoothing: antialiased`
- Base letter-spacing: `-.014em`
- Label/eyebrow style: uppercase, `0.08–0.12em` tracking, 10–11px, weight 600–700

### Motion tokens
```
--ease: cubic-bezier(0.22, 1, 0.36, 1)   /* spring-like, all reveals */
Micro:     140ms
Dismiss:   380ms
Entrance:  550ms
Panel:     550ms
```

### Layout rules
- Sidebar: sticky, left-anchored, 220px
- Main content: single-column vertical composition
- Side gutter: minimum 16px at all widths
- Cards: `border-radius: 8px` standard; `12px` for featured/My Pick
- Borders: `rgba(0,0,0,.08)` light / `rgba(255,255,255,.08)` dark
- Chip/badge fill: 6–8% opacity of semantic color

### Background
- `#F5F4F1` warm neutral — no dot grids
- Two static gradient orbs maximum — no drift, no animation
- White used only for My Pick card surfaces

### What NOT to do visually
- No animated/drifting background orbs
- No decorative floating shapes for "AI feel"
- No gauge/ring/progress bar for match percentages
- No six-column ATS Kanban board
- No charts, analytics widgets, or market insight panels in V1
- No generic "SaaS purple gradient hero"

---

## 17. LAUNCH SCOPE

### V1 — Build this
- [ ] Onboarding Step 1 (account creation) ← complete
- [ ] Onboarding Step 2 (resume upload + parsing) ← complete  
- [ ] Onboarding Step 3 ("Your next move") ← HTML polish needed
- [ ] Dashboard (design locked, motion complete)
- [ ] Opportunities page (fixes needed, then locked)
- [ ] Applications page (model locked, page to build)
- [ ] Searches page (fixes needed, then locked)
- [ ] Landing page (concept approved, HTML to build)
- [ ] Pricing + plan enforcement
- [ ] Stripe billing integration
- [ ] Opportunity Engine (7-stage pipeline)
- [ ] Resume + cover letter generation via Claude API
- [ ] Supabase auth + data layer

### Explicitly NOT in V1
See `POST_LAUNCH.md`

---

## 18. WORKING PROCESS RULES

- Do not advance to next build phase unless Lisa explicitly says current step is done
- Latest decisions override earlier ones — this document is the source of truth
- Design decisions that are "locked" must be preserved exactly; do not redesign them
- If something is ambiguous, flag it rather than guessing
- Always check: does this UI claim trace to data Careerely actually has?
