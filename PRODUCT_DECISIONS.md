# PRODUCT DECISIONS
> Only the latest decision is recorded. Earlier versions are not preserved.
> Last updated: 2026-09-30

---

## PRODUCT IDENTITY

**Decision:** Careerely is an AI agent, not a job board.  
The language, UX, and product architecture must all reflect this. The agent acts, the user reviews.

**Decision:** "My Pick" is a recommendation, not a ranked list item.  
The dashboard leads with one strong recommendation. The rest are "Also shortlisted." The agent has a point of view.

---

## PRICING MODEL

**Decision:** The unit of value is "applications prepared" — not "opportunities discovered."  
Earlier model had opportunity caps. This was removed. Every plan sees all shortlisted opportunities.

**Decision:** Automatic nightly preparation (top 2) is consistent across all tiers.  
This is not a premium feature. All paying users benefit from the agent working overnight.

**Decision:** Searches beyond plan limit are saved as paused — but the user must be told this explicitly.  
Never silently downgrade an action.

---

## OPPORTUNITY ENGINE

**Decision:** Seven stages, locked schema.  
See CAREERELY_MASTER.md §8. The schema is in TypeScript. Do not simplify.

**Decision:** Three distinct opportunity states: Shortlisted / Preparing / Ready.  
Earlier prototype collapsed these. `prepared:false` does NOT mean Preparing.

**Decision:** Preparing opportunities remain fully clickable and reviewable.  
Earlier version disabled Preparing opportunities. This was wrong.

**Decision:** Careerely never auto-infers "no response" or negative outcomes.  
If evidence is absent, the state is "unknown." Never "no response." Never negative.

---

## DASHBOARD

**Decision:** Single-column vertical composition with sticky left sidebar.  
Rejected: multi-column dashboard, widget-based layout, card grids.

**Decision:** My Pick is the editorial centerpiece. Only two evidence points shown.  
Earlier versions showed three+. Reduced to two strongest only.

**Decision:** No gauge, ring, or progress bar for match percentage.  
95% is shown as a large number. That is all.

**Decision:** "Review application" — not "Apply" — as the primary CTA.  
The agent prepared the work; the user reviews before submitting.

**Decision:** Background is warm neutral `#F5F4F1`. No dot grids. Two static gradient orbs max.  
Rejected: animated drifting orbs (makes product feel like "generic AI software").

**Decision:** Motion is sequenced to tell Careerely's story.  
Stats count up (work resolves first: reviewed → shortlisted → prepared), then My Pick reveals, then rows stagger. This is intentional — not a simultaneous fade-in.

**Decision:** "Actively hiring" removed from production UI.  
It appeared in the original mockup. It's not a signal Careerely can verify. Removed from production; permitted only in mockup/demo context.

---

## OPPORTUNITIES PAGE

**Decision:** Do not build a filterable job board.  
The page shows what Careerely shortlisted. No filter panel, no search box, no sorting controls in V1.

**Decision:** Remove AI opinion labels ("I'd look at this", "Worth reviewing") from non-pick rows.  
The match percentage is the signal. Being on this page already means Careerely recommends it.

**Decision:** "Not for me" dismiss is valuable preference data.  
After dismiss, offer an optional quick reason (Role / Company / Location / Salary / Industry / Other). Not mandatory.

---

## APPLICATIONS PAGE

**Decision:** Do not build an ATS or Kanban board.  
Four statuses only: Ready to apply → Applied → Interview → Offer. Declined/Withdrawn are closed outcomes.

**Decision:** "No response" is not a valid status.  
Careerely does not know if a company has responded. Do not invent this.

**Decision:** Clicking an external application link does NOT mark status as Applied.  
Require explicit user confirmation: "Did you apply? → Yes, I applied"

**Decision:** Outcome tracking is manual in V1.  
Email/calendar inference is post-launch.

---

## SEARCHES PAGE

**Decision:** Searches are missions, not filter configurations.  
The page answers "What is Careerely hunting for on my behalf?" — not "What are my search filters?"

**Decision:** Career Profile and Search parameters are explicitly separate.  
The edit modal must say: "Changes apply to this search only and will not affect your Career Profile."

**Decision:** Custom chip input is required.  
User cannot be limited to preset chips for Roles, Industries, and Locations. Career Profile suggestions appear first; user can add their own.

**Decision:** Do not add charts, analytics, market insights, or performance scores to Searches.  
The search card shows: active/paused status, parameters, reviewed count, shortlisted count, last scan. Nothing more.

---

## LANDING PAGE

**Decision:** The scroll-driven product demo replaces "How it works."  
If the user just saw the product work in front of them, we don't need to explain it with three steps and icons.

**Decision:** The demo is not clickable on the landing page.  
Landing page controls the narrative. Interactivity begins after sign-up.

**Decision:** No small "browser chrome" mockup.  
The dashboard occupies 1000–1200px on desktop — it feels like you're stepping into the product.

---

## AI BEHAVIOR

**Decision:** No fake intelligence claims in production.  
The following are never fabricated: applicant counts, hiring urgency, competition levels, ATS scores, market signals, "Actively hiring" badges.

**Decision:** Evidence absence = "unknown," never "negative."  
This is a core data integrity rule. No exceptions.

**Decision:** Agent uses first-person.  
"My pick" / "I'd start here" — not third-person "Careerely recommends."

---

## VISUAL DESIGN

**Decision:** Inter at all weights with optical sizing.  
No display typeface from Google Fonts for the product UI. Inter only.

**Decision:** Primary color is `#4B32B8` (purple). Green (`#1A7A4A`) for completion/success states only.  
No other accent colors in the core UI.

**Decision:** `cubic-bezier(0.22, 1, 0.36, 1)` is the standard ease for all transitions.  
This creates the spring-like premium feel. Do not swap for `ease-out` or `ease-in-out`.

**Decision:** Borderless opportunity rows with hairline separators.  
Rejected: card wrapper around every row, shadow on every item.

---

## THINGS WE EXPLICITLY DECIDED NOT TO BUILD (V1)

See POST_LAUNCH.md for the full list.

---

## OPEN QUESTIONS / FLAGGED CONFLICTS

1. **Step 3 CTA wording:** Vocabulary table says use "Find my opportunities" generally, but the Step 3 spec explicitly locks "Find my matches" as the CTA. Both are correct in context — not a conflict, but Claude Code should know Step 3 is the exception.

2. **"Reviewed X postings since yesterday" vs "last 7 days":** The dashboard header uses "since yesterday" language in the mockup. The Searches page uses "last 7 days." These need to be reconciled to a canonical time window when the real Opportunity Engine ships. For now, prototype data is illustrative — don't hardcode either as a product rule.

3. **Cohere logo hex:** Listed as `#D4531A` in design notes but not in the original locked fallback list. Use `#D4531A` as the Cohere fallback.
