# WHAT TO UPLOAD TO CLAUDE CODE / GITHUB

> Upload these files before Claude Code starts implementing anything.
> Order matters — put docs first so Claude Code reads them before touching design files.

---

## STEP 1 — Master docs (root of repo)

| File | Purpose |
|------|---------|
| `CAREERELY_MASTER.md` | Complete product spec — architecture, UX, copy, AI behavior, launch scope |
| `PRODUCT_DECISIONS.md` | Every locked product decision, latest wins, three flagged conflicts |
| `POST_LAUNCH.md` | Everything explicitly deferred from V1 — Claude Code must not build these |
| `DESIGN_INDEX.md` | Every design file mapped to its screen, lock status, and implementation notes |

---

## STEP 2 — Design prototypes (`/design` folder)

| File | Screen | Status |
|------|--------|--------|
| `design/dashboard-final.html` | `/dashboard` | ✅ LOCKED — do not redesign |
| `design/onboarding-step1-step2-final.html` | `/signup` + `/onboarding/2` | ✅ LOCKED — do not redesign |
| `design/onboarding-step3-wip.html` | `/onboarding/3` | ⚠️ Spec locked, HTML needs polish |
| `design/opportunities-wip.html` | `/opportunities` | ⚠️ Direction correct, fixes required (see DESIGN_INDEX.md) |
| `design/searches-wip.html` | `/searches` | ⚠️ Direction correct, fixes required (see DESIGN_INDEX.md) |
| `design/applications-wip.html` | `/applications` | ❌ Rough exploration — rebuild to spec (see CAREERELY_MASTER.md §11) |
| `design/landing-wip.html` | `/` | ❌ Not the approved concept — build from scratch (see CAREERELY_MASTER.md §13) |

---

## STEP 3 — First message to Claude Code

After uploading, open a Claude Code session and paste this as your first message:

```
Read CAREERELY_MASTER.md, PRODUCT_DECISIONS.md, POST_LAUNCH.md, and DESIGN_INDEX.md 
before doing anything else. These are the source of truth for the entire product.

CAREERELY_MASTER.md is the full spec.
PRODUCT_DECISIONS.md lists every locked decision — latest wins.
POST_LAUNCH.md lists features you must NOT build in V1.
DESIGN_INDEX.md maps every design file to its screen and tells you what's locked.

Do not redesign any screen marked LOCKED. Do not build any feature in POST_LAUNCH.md.
If you are uncertain whether something is in scope, check POST_LAUNCH.md first.
```

---

## DO NOT UPLOAD

These files are superseded — do not include them:

- `Careerely_v1.html`, `Careerely_v2.html`, `Careerely_v3_landing.html`
- `Careerely_dashboard.html`, `Careerely_dashboard_v2.html`, `Careerely_dashboard_v4.html`
- `Careerely_dashboard_dark.html`, `Careerely_dashboard_light.html`
- `Careerely_landing_v4.html` (latest landing iteration, but not the approved scroll-demo concept)
- Any earlier Careerely HTML not listed in STEP 2 above

---

## SUGGESTED REPO STRUCTURE

```
careerely/
├── CAREERELY_MASTER.md
├── PRODUCT_DECISIONS.md
├── POST_LAUNCH.md
├── DESIGN_INDEX.md
├── design/
│   ├── dashboard-final.html
│   ├── onboarding-step1-step2-final.html
│   ├── onboarding-step3-wip.html
│   ├── opportunities-wip.html
│   ├── searches-wip.html
│   ├── applications-wip.html
│   └── landing-wip.html
├── src/          ← Claude Code builds here
└── ...
```
