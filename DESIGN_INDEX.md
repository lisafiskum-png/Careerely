# DESIGN INDEX
> Every design file from the Careerely build, mapped to production screens.
> Last updated: 2026-09-30

---

## FILE INVENTORY

### `design/onboarding-step1-final.html`
- **Screen:** Onboarding Step 1 — Account creation
- **Status:** ✅ LOCKED & COMPLETE
- **Maps to:** `/signup` or `/onboarding/1`
- **Notes:** Standard name + email + password form. No known issues. Do not modify layout.

---

### `design/onboarding-step2-final.html`
- **Screen:** Onboarding Step 2 — Resume upload + parsing + review
- **Status:** ✅ LOCKED & COMPLETE
- **Maps to:** `/onboarding/2`
- **Notes:**
  - Three internal states: upload → parsing (Claude API call) → editable review screen
  - Claude API returns structured resume data; every field is user-editable
  - State machine architecture — preserve this pattern in implementation
  - Do not collapse into a single-state form

---

### `design/onboarding-step3-wip.html`
- **Screen:** Onboarding Step 3 — "Your next move" (preferences)
- **Status:** ⚠️ SPEC LOCKED, HTML NEEDS FINAL POLISH
- **Maps to:** `/onboarding/3`
- **Notes:**
  - Spec is 100% locked (see CAREERELY_MASTER.md §7)
  - The HTML prototype exists but needs final polish before it is locked
  - Do NOT alter the copy, structure, or submit sequence
  - The chip animation (staggered, analyzing sequence) is intentional
  - Submit sequence: fade out → 4 sequential checkmarks → success screen

---

### `design/dashboard-final.html`
- **Screen:** Main Dashboard (post-login home screen)
- **Status:** ✅ LOCKED — design, motion, and interactions complete
- **Maps to:** `/dashboard`
- **Notes:**
  - This is the canonical dashboard design. Do not redesign.
  - Contains working JS for: load sequence, countUp animations, scroll reveals, panel, dismissal
  - All motion parameters are locked (see CAREERELY_MASTER.md §9)
  - State consistency rule: Ramp appears in both shortlist AND Applications Ready
  - The panel is dynamic per opportunity — uses the `OPPS` data object
  - Clearbit logo loading with branded hex letter fallbacks

---

### `design/opportunities-wip.html`
- **Screen:** Opportunities page — full shortlisted list
- **Status:** ⚠️ DIRECTION CORRECT, FIXES REQUIRED
- **Maps to:** `/opportunities`
- **Required fixes before locking:**
  1. Separate three states: Shortlisted / Preparing / Ready — `prepared:false` ≠ Preparing
  2. Preparing opportunities must be clickable (not disabled)
  3. Remove time estimates (`~5 min`) — use "Preparing application…" only
  4. Remove "I'd look at this" / "Worth reviewing" from non-pick rows
  5. "Not for me" must offer optional quick reason after dismiss
  6. Empty state only triggers when ALL opportunities dismissed (incl. My Pick)
  7. Per-opportunity content — never reuse generic content across companies
  8. Canonical time window: last 7 days

---

### `design/applications-wip.html`
- **Screen:** Applications page — prepared apps + tracking
- **Status:** ❌ NOT YET BUILT (product model is locked)
- **Maps to:** `/applications`
- **Build spec:** CAREERELY_MASTER.md §11
- **Key constraints:**
  - Two sections only: "Ready to apply" (top) + "Your applications" (below)
  - Four statuses: Ready to apply → Applied → Interview → Offer
  - Closed outcomes: Declined / Withdrawn (not pipeline stages)
  - No Kanban board, no CRM, no analytics
  - External link click does NOT auto-mark as Applied — require confirmation
  - Nav badge = count of "Ready to apply" items only

---

### `design/searches-wip.html`
- **Screen:** Searches page — active search missions management
- **Status:** ⚠️ DIRECTION CORRECT, FIXES REQUIRED
- **Maps to:** `/searches`
- **Required fixes before locking:**
  1. Allow custom chip input for Roles, Industries, Locations (not just preset chips)
  2. Add optional minimum compensation field per search
  3. Canonical time window: last 7 days
  4. Two empty states (zero searches vs all-paused)
  5. Plan limit transparency — never silently create a paused search

---

### `design/landing-final.html`
- **Screen:** Public landing page
- **Status:** ✅ LOCKED & COMPLETE
- **Maps to:** `/` (public)
- **Notes:**
  - Scroll-driven product demo is the centerpiece — dashboard animates in on scroll via IntersectionObserver
  - Demo sequence: window scales in → greeting → countUp stats → pick card → evidence chips → prep status → shortlist → right col → activity log
  - Demo is NOT clickable — landing page controls the narrative
  - "How it works" section kept as complement to the demo (not a replacement)
  - Pricing rendered from `PLANS` JS array — update there, not in HTML
  - Nav scroll behaviour: transparent → frosted glass on scroll

---

## SUPERSEDED / DEPRECATED FILES

> Do not use these. They are earlier iterations replaced by the files above.

| Old file / description | Replaced by |
|------------------------|-------------|
| Any dashboard before `dashboard-final.html` | `dashboard-final.html` |
| Dashboard version without countUp / scroll reveals | `dashboard-final.html` |
| Dashboard with animated drifting orbs | `dashboard-final.html` (static orbs only) |
| Dashboard with hard-coded Stripe panel only | `dashboard-final.html` (dynamic per-opp panels) |
| Any landing page with static hero screenshot | Not yet built — see spec |

---

## IMPLEMENTATION NOTES FOR CLAUDE CODE

### Dashboard
- The `OPPS` JavaScript data object drives the panel content — one entry per company
- `runLoadSequence()` controls the load animation — do not replace with CSS-only approach
- `IntersectionObserver` on `s-apps` and `s-activity` elements for scroll reveals
- `dismissOpp(rowId)` cascades: row collapse → count fade → nav badge update
- Match bars use `data-pct` attribute and animate after pick card reveals (not on load)
- `panelPulse` CSS animation on source row when panel opens — do not remove

### Onboarding
- Step 2 uses a state machine — three distinct UI states, not one form
- Step 3 chip suggestions come from Claude API resume parse — not hardcoded
- Step 3 submit sequence has 4 checkmarks + success screen — implement exactly

### Design system
- All colors as CSS custom properties on `:root` — no hardcoded hex in components
- Dark mode: redefine tokens under `prefers-color-scheme: dark` + `[data-theme="dark"]`
- Ease token: `cubic-bezier(0.22, 1, 0.36, 1)` — use for all transitions
