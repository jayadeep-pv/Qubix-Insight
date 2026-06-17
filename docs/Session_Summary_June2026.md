# Session Summary — June 2026

## What We Did This Session

---

### 1. Platform Rebrand — Qubix Insight

- Renamed platform from previous branding to **Qubix Insight**
- Brand colour changed to orange `#FA4616` / `#FA4616` (dark variant `#c7340f`)
- Sidebar logo updated: "Qubix Insight" name + "Logixphere" sub-label
- Topbar title updated platform-wide
- Home page redesigned (see item 5)
- Favicon regenerated to match new orange brand icon

---

### 2. Admin Form UI Redesign — Two-Column Layout

All five admin form pages now use a two-column layout instead of a single narrow card:

**Before:** Single `admin-form-card` (max-width 900px, left-aligned), with secondary content behind tabs.

**After:**

```
┌───────────────────────────────────────────────────────────────┐
│  Breadcrumb + Title + Tabs                                    │
├─────────────────────────────────────┬─────────────────────────┤
│  Form Card (2fr)                    │  Guidance Card (1fr)    │
│  admin-form-card                    │  dc-card.guidance-card  │
│  ─ Trial banner (if isTrial)        │  ─ About [entity]       │
│  ─ Form fields                      │  ─ How it works         │
│  ─ Save / Cancel                    │    (green numbered steps│
└─────────────────────────────────────┴─────────────────────────┘
│  Secondary tab panel (full width when tab active)             │
│  admin-tab-panel                                              │
└───────────────────────────────────────────────────────────────┘
```

**Tab structure restored** — secondary content (Templates, Attributes, Rules, AI Profiles) is shown via tabs, not inline below the form. The Details tab shows the two-column layout.

| Page | Details tab | Secondary tabs |
|---|---|---|
| Document Types | Form + guidance | Templates |
| Templates | Form + guidance | Template Attributes, AI Profiles |
| Template Attributes | Form + guidance | Rules |
| Rules | Form + guidance only (no secondary) | — |
| AI Insight Profiles | Form + guidance only (no secondary) | — |

**CSS class used:** `.top-grid` (`grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr)`)

---

### 3. Run Screen (New Insight) UI Redesign

`StartReview.tsx` (`/new`) redesigned to use consistent two-column layout across all four modes:

**Mode picker** (shown at `/new` without preselected mode):
- 2×2 grid of mode cards, `max-width: 920px`, centered
- Mode cards show description, badge, and requirements
- Trial users see Compare and Scoring greyed out with "Upgrade →" prompt

**Form screen** (after mode selection):
- Left column (2fr): form fields (Insight Name, Doc Type, Template, Upload, AI Profiles)
- Right column (1fr): mode-specific guidance card with green numbered "How it works" steps
- Quick Extract: "How it works" + "Best for" note in right card
- Summarise / Compare / Scoring: Mode name + description + mode-specific 3-step guide

---

### 4. Guidance Card Design System

Consistent green numbered step cards introduced across all run screens and admin forms.

**New CSS classes in `App.css`:**

| Class | Purpose |
|---|---|
| `.guide-about` | Bold section title |
| `.guide-about-desc` | Grey description paragraph |
| `.guide-section-title` | Sub-heading (e.g. "How it works", "Best for") |
| `.guide-divider` | Separator line before sub-section |
| `.guide-steps` | Flex column container for steps |
| `.guide-step` | Individual step row (circle + text) |
| `.guide-step-num` | Green circle (`#1D9E75`) with white number |

Previously the Quick Extract form had its own `sr-extract-step-num` classes. These have been replaced by the shared `.guide-step-num` classes so all guidance cards render identically.

---

### 5. Home Page Redesign

New `HomePage.tsx` replaces the previous dashboard component for the root route (`/`):

- **Greeting card**: "Good morning/afternoon/evening, [Name]" with blue left border
- **KPI row**: Total Insights, Documents, High Risk, System Status (4 cards)
- **Quick Actions panel** (left, ~60% width): 4 mode cards — Quick Scan, Summarise Document, Compare Documents, Scoring — navigating to the corresponding StartReview mode
- **Recent Insights panel** (right, ~40% width): Last 10 runs with search, grouped by Today / This Week, with risk badges
- Layout containers: `hp-header` and `hp-split` both use `max-width: 1200px; margin: 0 auto`

---

### 6. Margin Consistency Fix

**Problem:** Navigating between Home → New Insight → Document Types caused the content to "jump" horizontally because each page used a different container width.

**Root cause:**
- Home page: `max-width: 1200px; margin: 0 auto` (via `hp-header` / `hp-split` classes)
- Run screens (`.dc-container`): `max-width: min(1400px, calc(100vw - 48px)); margin: 32px auto; padding: 0 20px` — wider + extra padding
- Admin forms (`.page`): `max-width: 1400px; margin: 0 auto; padding: 20px 40px 40px` — wider + 40px side padding

**Fix applied:**
- `.dc-container` → `max-width: 1200px; width: 100%; margin: 0 auto; padding: 0`
- `.page` → `max-width: 1200px; width: 100%; margin: 0 auto; padding: 10px 0 40px`
- `.page-sticky-header` → removed `max-width: 900px` and centering (now aligns with `top-grid` below)
- `.admin-form-card` and `.admin-tab-panel` → removed `max-width: 900px` and `margin: auto` (grid cell is the constraint)

All three page types now have identical left/right margins, matching the home page.

---

### 7. Trial User Access Documentation

`UserContext.tsx` provides `isTrial: boolean` to all components. Enforcement:

**Frontend (UI layer):**
- Admin form cards receive `admin-form-card--readonly` CSS class — fields non-interactive
- Yellow trial banner shown in each admin form card
- Compare and Scoring mode cards greyed out on run screen
- `TrialGuard` in `App.tsx` redirects admin routes to `/home` for trial users
- Topbar shows "Trial" badge

**Backend (authoritative):**
- HTTP 403 on all mutation endpoints for trial tenants
- HTTP 403 on Compare/Scoring analysis runs for trial tenants
- Personal email domain blocking in `GetCurrentUser.cs`

---

### 8. Documents Updated

| Document | Version | Key Changes |
|---|---|---|
| `Identity_Management_Architecture.md` | 1.0 → **1.1** | Added Section 9: Trial User Frontend Experience (isTrial flag, read-only forms, TrialGuard, upgrade path) |
| `Qubix_Insight_Deployment_Guide_v1.2.md` | 1.2 → **1.3** | Added Section 11: Frontend UI Architecture (layout system, two-column forms, run screen, guidance cards, margin model, trial UI enforcement, key source files) |
| `Session_Summary_June2026.md` | New | This file |
| `BuildDocs.ps1` | Updated | Output .docx for deployment guide → `v1.3.docx`; footer/title updated to v1.3 / v1.1 / June 2026 |

To regenerate Word documents: `cd docs; .\BuildDocs.ps1`

---

## Outstanding Items

| Item | Status |
|---|---|
| Trial `ilx_tenantsetting` record in Master Dataverse | Pending — needs External ID tenant GUID |
| Trial Dataverse sandbox environment provisioned | Pending |
| Company branding logo uploaded | Pending |
| Page heading set to "Qubix Insight Registration" in user flow | Pending |
| OTP sender name → "Qubix Insight Identity" (tenant display name) | Pending |
| Custom email sender (from address) | Future — Custom authentication extensions + Azure Communication Services |
| Backend deploy to Azure (latest changes) | Pending — use VS Code Azure Functions extension |

---

## Key Reference Values

| Item | Value |
|---|---|
| Frontend SPA URL | `https://witty-mushroom-08917f703.azurestaticapps.net` |
| Backend API URL | `https://func-ilogix-qubixinsight-prod-uks.azurewebsites.net/api` |
| Frontend Client ID | `c9e00263-aebc-4d59-ad9e-7e6b00d4fc89` |
| Backend API Client ID | `ba5f6329-ac7b-49d6-a9df-a05e9c84f422` |
| External ID Client ID | `a7d39fd7-3fc6-459b-b2a3-a735fe40b989` |
| Authority Tenant ID (ilogixglobal) | `91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d` |
| External ID authority | `https://ilogixidentity.ciamlogin.com/` |
| External ID user flow | `QubixSignUpSignIn` |
| Brand orange | `#FA4616` |
| Sidebar width | `250px` (CSS variable `--sidebar-width`) |
| Content max-width | `1200px` (all pages) |
