# Qubix Insight Platform — Azure Infrastructure Setup Guide

**Version 1.3 | June 2026 | Confidential**

---

## What's New in v1.3

| Area | Change |
|---|---|
| Frontend | New Section 10: Frontend UI Architecture — layout system, two-column admin forms, run screen layout, guidance card design system, margin model |
| Trial UX | Trial user restrictions fully documented: read-only admin forms, Compare/Scoring mode gating, TrialGuard route protection |
| Checklist | Section 12 updated with frontend enforcement items |
| Branding | Platform renamed to **Qubix Insight** (orange #FA4616 brand colour); sidebar and topbar updated |

## What's New in v1.2

| Area | Change |
|---|---|
| Schema | All Dataverse tables and columns renamed from `hollis_` → `ilx_` prefix; Comparison → Analysis entities |
| Identity | New Section 4.4: Entra External ID for trial user sign-up |
| Identity | Dual MSAL frontend (corporate Azure AD + External ID) |
| Backend | Personal email domain blocking for trial tenants (`GetCurrentUser`) |
| User Flow | User attributes extended: Given Name, Surname, Company Name, Job Title, Country |
| Onboarding | Trial tenant onboarding path added to Section 13 |
| Checklist | Security checklist updated with External ID and email domain items |

---

## Table of Contents

1. Overview
2. Architecture Summary
3. Azure Resource Naming Standards
4. Resource 1 — Microsoft Entra ID (Azure AD + External ID)
5. Resource 2 — Azure Blob Storage
6. Resource 3 — Azure Functions
7. Resource 4 — Azure OpenAI Service
8. Resource 5 — Azure AI Document Intelligence
9. Resource 6 — Microsoft Dataverse (Power Platform)
10. Resource 7 — Azure Static Web Apps (Frontend)
11. Frontend UI Architecture
12. Environment Variables Reference
13. Security & Permissions Checklist
14. Tenant Onboarding Procedure
15. Troubleshooting

---

## 1. Overview

Qubix Insight is a multi-tenant SaaS platform that uses Azure AI services to extract, compare, and analyse legal and commercial documents. This guide documents every Azure resource required to run the platform and provides step-by-step provisioning instructions including all required permissions, API access, and configuration values.

### Platform Components

| Component | Technology |
|---|---|
| Frontend | React 19 SPA, Azure Static Web Apps, dual MSAL authentication |
| Backend | Azure Functions (.NET 10 Isolated Process) |
| AI Processing | Azure OpenAI (GPT) + Azure AI Document Intelligence (OCR) |
| Storage | Azure Blob Storage (multi-tenant containers) |
| Data Store | Microsoft Dataverse (Power Platform) — one environment per tenant |
| Identity (Corporate) | Microsoft Entra ID — multi-tenant app registration, corporate users |
| Identity (Trial) | Microsoft Entra External ID (CIAM) — `ilogixidentity` tenant, trial sign-ups |

---

## 2. Architecture Summary

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER BROWSER (React SPA)                         │
│                                                                         │
│  Corporate login                         Trial sign-up / login          │
│  MSAL → Entra ID                         MSAL → Entra External ID       │
│  Bearer JWT (tid = corp tenant)          ID token (tid = ext id tenant) │
└───────────────────────┬──────────────────────────┬──────────────────────┘
                        │ HTTPS + Bearer Token      │
                        └──────────────┬────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        AZURE FUNCTIONS (Backend API)                     │
│  - JWT parsed → tid claim extracted                                      │
│  - tid looked up in Master Dataverse (ilx_tenantsetting)                 │
│  - Per-tenant Dataverse connection created (ClientSecret auth)           │
│  - Trial tenants: personal email domains blocked in GetCurrentUser       │
│  - Files → Azure Blob Storage (per-tenant container)                     │
│  - OCR → Azure AI Document Intelligence                                  │
│  - AI → Azure OpenAI (GPT deployment)                                    │
└──────┬─────────────────┬──────────────────┬──────────────────────────────┘
       │                 │                  │
       ▼                 ▼                  ▼
┌─────────┐   ┌──────────────┐   ┌──────────────────┐
│  Blob   │   │  Azure AI    │   │   Dataverse      │
│ Storage │   │ Doc Intell.  │   │  (per tenant)    │
└─────────┘   └──────────────┘   └──────────────────┘
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │   MASTER Dataverse   │
                              │ (ilx_tenantsetting)  │
                              └──────────────────────┘
```

### Key Design Points

- The platform is multi-tenant. Each customer tenant has its own Dataverse environment and Blob Storage container.
- **Corporate users** authenticate via the main Azure AD tenant (`login.microsoftonline.com`). Their `tid` claim maps to their own company AAD tenant registered in `ilx_tenantsetting`.
- **Trial users** authenticate via Entra External ID (`ilogixidentity.ciamlogin.com`). Their `tid` claim maps to the ilogixidentity CIAM tenant, which is registered in `ilx_tenantsetting` with `ilx_subscriptiontier = Trial`.
- The backend resolves both authentication paths identically via the `tid` JWT claim — no code differences between corporate and trial users after token validation.
- Blob Storage uses `DefaultAzureCredential` (Managed Identity) — no storage keys in configuration.
- JWT `tid` claims are used exclusively for tenant resolution — no custom headers are trusted.

---

## 3. Azure Resource Naming Standards

*(Unchanged from v1.1 — refer to existing document for full naming table.)*

---

## 4. Resource 1 — Microsoft Entra ID

Two tenants are involved in authentication:

| Tenant | Purpose | Authority |
|---|---|---|
| ilogixglobal (main) | Corporate user login | `login.microsoftonline.com/{authorityTenantId}` |
| ilogixidentity (CIAM) | Trial user sign-up & login | `ilogixidentity.ciamlogin.com` |

Two app registrations exist in the **main ilogixglobal tenant**:

### 4.1 Backend API App Registration

| Field | Value |
|---|---|
| Display Name | Qubix Insight API |
| App ID (Client ID) | `ba5f6329-ac7b-49d6-a9df-a05e9c84f422` |
| Account Types | Multi-tenant (any organisational directory) |
| App ID URI | `api://ba5f6329-ac7b-49d6-a9df-a05e9c84f422` |
| Exposed Scope | `qubixinsightapi.access` |
| Token Version | v2 |
| API Permission 1 | Microsoft Graph → User.Read (delegated) |
| API Permission 2 | Dynamics CRM → user_impersonation (delegated) — **required for Dataverse** |

**Step-by-Step:**

| Step | Action | Detail |
|---|---|---|
| 1 | Navigate to Entra ID | portal.azure.com → Microsoft Entra ID → App registrations → New registration |
| 2 | Set Name | `Qubix Insight API` |
| 3 | Account Type | Accounts in any organizational directory (Multi-tenant) |
| 4 | Redirect URI | Leave blank (backend has no redirect) |
| 5 | Register | Note the Application (client) ID |
| 6 | App ID URI | Expose an API → Set URI → accept default `api://{client-id}` |
| 7 | Add Scope | Name: `qubixinsightapi.access`. Admins and users. Enable. |
| 8 | Client Secret | Certificates & secrets → New client secret. Store value in Key Vault. |
| 9 | Manifest | Set `"accessTokenAcceptedVersion": 2`. Save. |
| 10 | Dynamics CRM Permission | API permissions → Add → APIs my org uses → "Dynamics CRM" → Delegated → `user_impersonation` |
| 11 | Admin Consent | Grant admin consent. Both permissions must show green ✓. |

### 4.2 Frontend SPA App Registration

| Field | Value |
|---|---|
| Display Name | Qubix Insight App |
| App ID (Client ID) | `c9e00263-aebc-4d59-ad9e-7e6b00d4fc89` |
| Account Types | Multi-tenant |
| Redirect URIs (SPA) | `http://localhost:3000`, `https://witty-mushroom-08917f703.azurestaticapps.net` |
| Authority | `login.microsoftonline.com/{authorityTenantId}` |
| Token Version | v2 |

**Step-by-Step:**

| Step | Action | Detail |
|---|---|---|
| 1 | New Registration | Entra ID → App registrations → New registration |
| 2 | Name | `Qubix Insight App` |
| 3 | Account Type | Multi-tenant |
| 4 | Redirect URI | Platform: Single-page application. URI: `http://localhost:3000` |
| 5 | Register | Note the Application (client) ID |
| 6 | Add Production URI | Authentication → Add URI: `https://witty-mushroom-08917f703.azurestaticapps.net` |
| 7 | API Permission | My APIs → Qubix Insight API → Delegated → `qubixinsightapi.access` |
| 8 | Admin Consent | Grant admin consent. Green ✓ required. |

### 4.3 Service Principal for Dataverse Access

*(Unchanged from v1.1 — same app registration reused as service principal.)*

The Application User must be added in **every** Dataverse environment (Master + all tenant environments). Use Client ID `ba5f6329-ac7b-49d6-a9df-a05e9c84f422`.

---

### 4.4 Entra External ID — Trial User Authentication

Trial users sign up and sign in through a separate **Microsoft Entra External ID (CIAM)** tenant: `ilogixidentity.onmicrosoft.com`. This is a completely separate Azure directory from the main ilogixglobal tenant.

#### 4.4.1 Create the External ID Tenant

| Step | Action | Detail |
|---|---|---|
| 1 | Switch/Create tenant | portal.azure.com → Settings (top-right) → Switch directory → Create new tenant |
| 2 | Select type | Choose **External** (Entra External ID / CIAM) |
| 3 | Name | Tenant name: `ilogixidentity`. Domain: `ilogixidentity.onmicrosoft.com` |
| 4 | Region | Same as main resources (UK) |
| 5 | Confirm | Wait for provisioning (~2 minutes) |

#### 4.4.2 App Registration in External ID Tenant

Switch to the `ilogixidentity` tenant in the Azure portal before performing these steps.

| Field | Value |
|---|---|
| Display Name | Qubix Insight Trial App |
| App ID (Client ID) | `a7d39fd7-3fc6-459b-b2a3-a735fe40b989` |
| Account Types | Accounts in this organizational directory only |
| Redirect URIs (SPA) | `http://localhost:3000`, `https://witty-mushroom-08917f703.azurestaticapps.net` |

| Step | Action | Detail |
|---|---|---|
| 1 | New Registration | Entra ID → App registrations → New registration |
| 2 | Name | `Qubix Insight Trial App` |
| 3 | Account Type | Accounts in this organizational directory only |
| 4 | Redirect URI | Platform: **Single-page application**. URI: `https://witty-mushroom-08917f703.azurestaticapps.net` |
| 5 | Add Dev URI | Authentication → Add URI: `http://localhost:3000` |
| 6 | Register | Note the Application (client) ID — this becomes `externalIdClientId` in `config.json` |

> **Note:** Do NOT grant the External ID app any API permissions for the backend API scope. Trial users receive ID tokens (OIDC scopes: `openid profile email`). The backend reads the `tid` claim from the token to resolve the trial tenant — no cross-tenant API permission is required.

#### 4.4.3 User Flow — Sign Up and Sign In

| Step | Action | Detail |
|---|---|---|
| 1 | Navigate | External Identities → User flows → New user flow |
| 2 | Flow type | Select **Sign up and sign in** → Create |
| 3 | Name | `QubixSignUpSignIn` |
| 4 | Identity providers | Email with password |
| 5 | Create | Click Create |

#### 4.4.4 User Attributes (Page Layouts)

After creating the flow:

1. User flows → `QubixSignUpSignIn` → **Page layouts**
2. In the **User Flow Attributes** list, tick the following and mark as Required where indicated:

| Attribute | Label | Required | Notes |
|---|---|---|---|
| email | Email Address | ✅ (always) | Auto-collected, cannot untick |
| givenName | Given Name | ✅ | First name |
| surname | Surname | ✅ | Last name |
| displayName | Display Name | — | Auto-composed from given + surname |
| CompanyName | Company Name | ✅ | Description: *"Enter the name of your organisation or business."* |
| jobTitle | Job Title | — | Useful for lead qualification |
| country | Country/Region | — | Data residency awareness |

3. Click **Save**.

#### 4.4.5 Application Claims (Token)

1. User flows → `QubixSignUpSignIn` → **User attributes** (left nav under Settings)
2. Ensure all ticked attributes above also have their **Return claim** checkbox ticked
3. Save — these claims will appear in the ID token returned to the frontend

#### 4.4.6 Company Branding

1. Microsoft Entra ID → **Company branding** → Edit default branding
2. Set **Sign-in page text** to `Qubix Insight` (replaces the default tenant name "ILOGIX IDENTITY")
3. Upload logo if available
4. Save

#### 4.4.7 Page Heading Customisation (Languages)

To change the heading text on the sign-up page:

1. User flows → `QubixSignUpSignIn` → **Languages**
2. Click **English (United States)**
3. Under **Sign up and sign in (Preview)**, click **Download defaults (en)**
4. Open the JSON file, find the `"heading"` key and set: `"Qubix Insight Registration"`
5. Save the file
6. Back in the portal, click **Upload new overrides** → select the edited file
7. Save

#### 4.4.8 Register Trial Tenant in Master Dataverse

After External ID setup, create a record in the Master Dataverse `ilx_tenantsetting` table for the trial pool:

| Column | Value |
|---|---|
| `ilx_tenantname` | `Qubix Insight Trial` |
| `ilx_aadtenantid` | External ID tenant GUID (found in ilogixidentity tenant → Overview) |
| `ilx_subscriptiontier` | `Trial` |
| `ilx_dataverseurl` | URL of the trial sandbox Dataverse environment |
| `ilx_storagecontainername` | `tenant-trial` |
| `ilx_isactive` | `true` |

#### 4.4.9 Frontend Configuration

Set `externalIdClientId` in `public/config.json`:

```json
{
  "clientId": "c9e00263-aebc-4d59-ad9e-7e6b00d4fc89",
  "apiScope": "api://ba5f6329-ac7b-49d6-a9df-a05e9c84f422/qubixinsightapi.access",
  "authorityTenantId": "91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d",
  "apiBase": "https://func-ilogix-qubixinsight-prod-uks.azurewebsites.net/api",
  "externalIdClientId": "a7d39fd7-3fc6-459b-b2a3-a735fe40b989"
}
```

The **Start free trial** button in the login page is automatically enabled when `externalIdClientId` is non-empty.

#### 4.4.10 Backend — Personal Email Domain Blocking

The `GetCurrentUser` Azure Function blocks sign-ins from personal email domains (gmail, hotmail, outlook, iCloud, etc.) for trial tenants. This is enforced server-side regardless of what the External ID user flow collects.

No backend configuration is required — the blocked domain list is hardcoded in `backend/GetCurrentUser.cs`. To add or remove domains, edit the `BlockedDomains` `HashSet` and redeploy.

---

## 5–10. Resources 2–7 (Blob Storage, Functions, OpenAI, Doc Intelligence, Dataverse, Static Web Apps)

*(Core provisioning steps unchanged from v1.1. See existing document for full step-by-step tables.)*

**Key changes affecting Sections 5–10:**

- **Section 9 (Dataverse)** — All `hollis_` table/column references updated to `ilx_` prefix (see schema rename table below)

---

## 9. Resource 6 — Microsoft Dataverse (updated schema)

### Schema Rename Reference (hollis_ → ilx_)

All Dataverse table names and column prefixes changed in May 2026. Use `ilx_` throughout.

#### Entity Renames

| Old Name | New Name |
|---|---|
| `hollis_comparison` | `ilx_analysis` |
| `hollis_comparisonrun` | `ilx_analysisrun` |
| `hollis_comparisondocument` | `ilx_analysisdocument` |
| `hollis_comparisonresult` | `ilx_analysisresult` |
| `hollis_comparisontemplate` | `ilx_analysistemplate` |
| `hollis_comparisonruninsight` | `ilx_analysisruninsight` |
| `hollis_comparisoncandidate` | `ilx_analysiscandidate` |
| `hollis_comparisonevaluation` | `ilx_analysisevaluation` |
| `hollis_evaluationresult` | `ilx_analysisevaluationresult` |
| `hollis_comparisonrule` | `ilx_analysisrule` |
| `hollis_attributeaiinsight` | `ilx_analysisattributeinsight` |

#### Unchanged Entities (prefix only — hollis_ → ilx_)

`ilx_aiinsightprofile`, `ilx_attributecategory`, `ilx_documenttype`, `ilx_templateaiprofile`, `ilx_templateattribute`, **`ilx_tenantsetting`**

### 9.1 Master Dataverse Environment

| Field | Value |
|---|---|
| Key Table | `ilx_tenantsetting` |
| Authentication | Service Principal — ClientSecret (Qubix_ClientId, Qubix_ClientSecret, Qubix_TenantId) |

### `ilx_tenantsetting` Table Columns

| Column Name | Type | Description |
|---|---|---|
| `ilx_tenantid` | Text (Primary Name) | Internal tenant key / business identifier |
| `ilx_tenantname` | Text | Display name for the tenant |
| `ilx_aadtenantid` | Text | Azure AD Tenant GUID — runtime lookup key |
| `ilx_alloweddomains` | Text | Comma-separated permitted email domains |
| `ilx_dataverseurl` | Text (URL) | Full URL of the tenant's Dataverse environment |
| `ilx_storagecontainername` | Text | Blob container name for this tenant |
| `ilx_storageaccountname` | Text | Azure Storage account name |
| `ilx_storagesassecretref` | Text | Key Vault secret reference (stored but not consumed — backend uses Managed Identity) |
| `ilx_subscriptiontier` | OptionSet | Trial / Standard / Enterprise |
| `ilx_onboardeddate` | Date/Time | Date the tenant was onboarded |
| `ilx_isactive` | Boolean | If false, tenant is blocked from logging in |

### 9.2 Tenant Dataverse Environments

| Field | Value |
|---|---|
| Solution Name | Qubix Insight Solution (managed) — `QubixInsight_1_0_0_2.zip` |
| Tables Included | `ilx_analysis`, `ilx_analysisrun`, `ilx_analysisdocument`, `ilx_analysisresult`, `ilx_analysistemplate`, `ilx_templateattribute`, `ilx_documenttype`, `ilx_analysisruninsight`, `ilx_aiinsightprofile`, `ilx_analysisrule` |

---

## 11. Frontend UI Architecture

### 11.1 Layout System

The frontend is a React 19 SPA. Every page shares the same shell:

```
App → Layout.tsx
  ├── .sidebar           (250px wide, collapsible to icon-only mode)
  └── .layout-right
      ├── .topbar        (58px fixed, shows page title + tenant/user info + Trial badge)
      └── .content       (flex column, padding: 24px 28px, scrollable)
          └── Page content  (max-width: 1200px, margin: 0 auto — matches home page)
```

All page content — home page (`hp-header`, `hp-split`), run screens (`.dc-container`), and admin forms (`.page`) — is constrained to `max-width: 1200px; margin: 0 auto` within the `.content` padding area. This produces identical left/right gutters across all screens regardless of viewport width.

### 11.2 Admin Form Layout Pattern

Every admin form page uses a two-column layout for the Details section:

```
┌──────────────────────────────────────────────────────────────┐
│  Breadcrumb → Page Title                                     │
│  Tabs: Details | [Secondary content name]      (.page-sticky-header) │
├─────────────────────────────────────┬────────────────────────┤
│  Form Card          (2fr)           │  Guidance Card  (1fr)  │
│  .admin-form-card                   │  .dc-card.guidance-card│
│  ─ Trial banner (if isTrial)        │  ─ About [entity]      │
│  ─ Form fields                      │  ─ "How it works"      │
│  ─ Save / Cancel                    │    numbered steps      │
└─────────────────────────────────────┴────────────────────────┘
│  Secondary tab content (full width, shown only when tab active)       │
│  .admin-tab-panel — Templates / Attributes / Rules list               │
└───────────────────────────────────────────────────────────────────────┘
```

Implemented with the `.top-grid` CSS class (`grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr)`).

| Admin Form Page | Details tab | Secondary tabs |
|---|---|---|
| Document Types (`/document-types/:id`) | Name, description, base AI prompt, usage modes, active | Templates |
| Templates (`/comparison-templates/:id`) | Name, document type, version, description, active | Template Attributes, AI Profiles |
| Template Attributes (`/admin/template-attributes/:id`) | Name, template, data type, AI prompt, category, active | Rules |
| Rules (`/admin/rules/:id`) | Name, advisory text, template, attribute, direction, severity, weight, active | *(none)* |
| AI Insight Profiles (`/admin/ai-insight-profiles/:id`) | Name, code, prompt, status, display order | *(none)* |

### 11.3 Trial User UI Enforcement

When `isTrial === true` (from `UserContext`):

- Admin form cards render with the `admin-form-card--readonly` CSS class — all fields become non-interactive (grey background, `pointer-events: none`)
- A yellow lock banner is shown at the top of each form card: *"Trial account — this record is read only. Upgrade to enable editing."*
- Compare and Scoring mode cards on the New Insight screen are greyed out with an "Upgrade →" prompt
- `TrialGuard` in `App.tsx` redirects `/document-types`, `/comparison-templates`, and all `/admin/*` routes to `/home` for trial users
- The topbar displays a "Trial" badge next to the user name

Backend enforcement (HTTP 403) is independent — the frontend restrictions are a UX layer only.

### 11.4 New Insight Screen (StartReview)

Route `/new` — a single React component handles all four insight modes:

| Mode | Template required | Min documents | Notes |
|---|---|---|---|
| Discovery | No | 1 | Freely detects all attributes; results can be saved as a template |
| Summarise | Yes | 1 | Extracts template fields + executive summary |
| Compare | Yes | 2+ | Side-by-side field extraction, no scoring |
| Scoring | Yes | 2+ | Field extraction + rules-based scoring and ranking |

The screen has two views: a **mode picker** (2×2 card grid, `max-width: 920px`) and a **form view** (two-column: form card left, mode guidance card right). Navigation between modes via the breadcrumb or mode selection.

### 11.5 Guidance Card Design System

Both run screens and admin forms use a shared set of CSS classes for guidance cards (`App.css`):

| Class | Purpose |
|---|---|
| `.guide-about` | Bold card title ("About Document Types", "How it works") |
| `.guide-about-desc` | Descriptive paragraph (grey, `line-height: 1.6`) |
| `.guide-section-title` | Sub-heading within a card ("How it works", "Best for", "Requirements") |
| `.guide-divider` | Horizontal rule + top padding before a sub-section |
| `.guide-steps` | Flex column container for numbered steps |
| `.guide-step` | Row: number circle + text |
| `.guide-step-num` | Filled circle, background `#1D9E75` (green), white number |

This ensures visual consistency — the green numbered circles on the Discovery form, the Scoring run screen, and all admin form guidance cards look identical.

### 11.6 Frontend Key Source Files

| File | Purpose |
|---|---|
| `src/layout/Layout.tsx` + `Layout.css` | Sidebar (collapsible), topbar, `.content` shell |
| `src/App.css` | Global styles: `.dc-container`, `.top-grid`, `.guide-*`, buttons, cards, `TrialGuard` |
| `src/styles/admin.css` | Admin page styles: `.page`, `.admin-form-card`, `.admin-tab-panel`, `admin-form-card--readonly` |
| `src/pages/StartReview.tsx` | New Insight — all four modes (Discovery, Summarise, Compare, Scoring) |
| `src/pages/HomePage.tsx` | Home dashboard — KPIs, Quick Actions, Recent Insights (max-width: 1200px containers) |
| `src/pages/DocumentTypeForm.tsx` | Admin form: two-column layout, Details + Templates tabs |
| `src/pages/ComparisonTemplateForm.tsx` | Admin form: two-column layout, Details + Attributes + AI Profiles tabs |
| `src/pages/TemplateAttributeForm.tsx` | Admin form: two-column layout, Details + Rules tabs |
| `src/pages/RuleForm.tsx` | Admin form: two-column layout, no tabs |
| `src/pages/AiInsightProfileForm.tsx` | Admin form: two-column layout, no tabs |
| `src/context/UserContext.tsx` | `isTrial`, `tenantName`, `userEmail`, `userName` — propagated to all components |

---

## 12. Environment Variables Reference

All variables set in Function App → Settings → Environment variables. Use `Qubix_` prefix throughout.

| Variable | Description | Example |
|---|---|---|
| `AzureWebJobsStorage` | Functions runtime storage (auto-set at creation) | `DefaultEndpointsProtocol=https;AccountName=sailogixqubixiproduks;...` |
| `Qubix_AzureOpenAIEndpoint` | Azure OpenAI endpoint URL | `https://<name>.openai.azure.com/` |
| `Qubix_AzureOpenAIKey` | Azure OpenAI API Key | From Keys and Endpoint blade |
| `Qubix_AzureOpenAIDeployment` | GPT model deployment name | `gpt4o-prod` |
| `Qubix_DocumentIntelligenceEndpoint` | Document Intelligence endpoint | `https://<name>.cognitiveservices.azure.com/` |
| `Qubix_DocumentIntelligenceKey` | Document Intelligence API Key | From Keys and Endpoint blade |
| `Qubix_MainDataverseUrl` | Master Dataverse environment URL | `https://org-master.crm11.dynamics.com` |
| `Qubix_ClientId` | Service Principal Client ID | `ba5f6329-ac7b-49d6-a9df-a05e9c84f422` |
| `Qubix_ClientSecret` | Service Principal Client Secret | From Certificates & secrets blade |
| `Qubix_TenantId` | ilogixglobal AAD Tenant ID | `91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d` |
| `Qubix_BlobBaseUrl` | Document Blob Storage endpoint | `https://sailogixqubixidocsprod.blob.core.windows.net` |
| `Qubix_StorageAccountName` | Document storage account name | `sailogixqubixidocsprod` |
| `Qubix_SasExpiryMinutes` | SAS URL validity duration | `30` |

> **Note:** `ilx_storagesassecretref` is stored in `ilx_tenantsetting` but not consumed at runtime. The backend authenticates to Blob Storage via Managed Identity (`DefaultAzureCredential`), not Key Vault SAS secrets. Leave this field blank.

---

## 13. Security & Permissions Checklist

| Done | Category | Check |
|---|---|---|
| ☐ | Entra ID | Frontend and Backend app registrations are Multi-Tenant |
| ☐ | Entra ID | Backend API exposes scope: `qubixinsightapi.access` |
| ☐ | Entra ID | Backend API has Dynamics CRM → `user_impersonation` delegated permission added |
| ☐ | Entra ID | Admin consent granted on Dynamics CRM permission — green ✓ |
| ☐ | Entra ID | Frontend app has admin-consented permission to backend scope |
| ☐ | Entra ID | Client Secret stored only in Key Vault or Function App env vars (not in code) |
| ☐ | External ID | `ilogixidentity` CIAM tenant created |
| ☐ | External ID | `QubixSignUpSignIn` user flow created with correct attributes |
| ☐ | External ID | External ID app registration redirect URIs include the SWA URL |
| ☐ | External ID | `externalIdClientId` set in `public/config.json` |
| ☐ | External ID | Trial tenant `ilx_tenantsetting` record created in Master Dataverse with `ilx_aadtenantid` = External ID tenant GUID |
| ☐ | External ID | Company branding configured (sign-in page text, logo) |
| ☐ | Backend | Personal email domain blocking active in `GetCurrentUser.cs` for trial tenants |
| ☐ | Blob Storage | Runtime storage account created; `AzureWebJobsStorage` set |
| ☐ | Blob Storage | Document storage account created |
| ☐ | Blob Storage | Storage Blob Delegator role assigned to Function App Managed Identity |
| ☐ | Blob Storage | Storage Blob Data Contributor role assigned to Function App Managed Identity |
| ☐ | Blob Storage | Anonymous blob access DISABLED on both accounts |
| ☐ | Blob Storage | Minimum TLS 1.2 on both accounts |
| ☐ | Functions | Managed Identity enabled |
| ☐ | Functions | CORS restricted to SWA URL only (no wildcard `*` in production) |
| ☐ | Functions | `local.settings.json` in `.gitignore` |
| ☐ | Functions | All environment variables set |
| ☐ | Dataverse | Application User added in Master Dataverse environment |
| ☐ | Dataverse | Application User added in every tenant Dataverse environment |
| ☐ | Dataverse | Security Role assigned in every environment |
| ☐ | Dataverse | `ilx_tenantsetting` records have correct `ilx_isactive` flags |
| ☐ | JWT | Backend resolves tenant from `tid` claim only — no custom headers trusted |
| ☐ | Trial | Trial tenants blocked from Compare/Scoring modes (backend-enforced) |
| ☐ | Frontend | Admin forms render `admin-form-card--readonly` for trial users (UI layer) |
| ☐ | Frontend | `TrialGuard` wraps all admin routes — trial users cannot reach `/document-types`, `/comparison-templates`, `/admin/*` |
| ☐ | Frontend | Trial "Upgrade →" prompt shown on Compare and Scoring mode cards |
| ☐ | Frontend | All pages use `max-width: 1200px; margin: 0 auto` — consistent with home page margins |
| ☐ | Frontend | Guidance cards use `.guide-step-num` green circles — consistent across run and admin screens |

---

## 14. Tenant Onboarding Procedure

There are two onboarding paths depending on the tenant type.

### 13A. Corporate Tenant Onboarding

| Step | Action | Detail |
|---|---|---|
| 1 | Create Dataverse Environment | admin.powerplatform.microsoft.com → New. Name: `Qubix Insight - <TenantName>`. Type: Production. |
| 2 | Install Managed Solution | Import `QubixInsight_1_0_0_2.zip` into the new environment |
| 3 | Add Application User | Application users → New → Qubix Insight API (Client ID: `ba5f6329-...`) → Assign role |
| 4 | Create Blob Container | `sailogixqubixidocsprod` → Containers → `tenant-<shortname>` (lowercase) |
| 5 | Get Customer AAD Tenant ID | Customer provides their Directory ID from Entra ID → Overview |
| 6 | Create `ilx_tenantsetting` Record | Master Dataverse → `ilx_tenantsetting` → New → fill all columns |
| 7 | Set Subscription Tier | `ilx_subscriptiontier`: `Trial` (initial) or `Standard`/`Enterprise` |
| 8 | Activate | `ilx_isactive = true` |
| 9 | Test | Ask a user from that tenant to log in at the SWA URL |
| 10 | Verify Blob | Upload a test document; confirm it appears in the correct container |
| 11 | Upgrade | Update `ilx_subscriptiontier` to `Standard` to unlock full features |

### 13B. Trial User Onboarding (via Entra External ID)

Trial users self-register through the **Start free trial** button on the login page. No manual Dataverse environment setup is required per user — all trial users share a single sandbox environment.

| Step | Action | Detail |
|---|---|---|
| 1 | One-time: Create trial Dataverse | Single shared Dataverse environment for all trial users |
| 2 | One-time: Install solution | Import `QubixInsight_1_0_0_2.zip` into the trial environment |
| 3 | One-time: Add Application User | Same as corporate — Qubix Insight API service principal |
| 4 | One-time: Create trial Blob container | `tenant-trial` in `sailogixqubixidocsprod` |
| 5 | One-time: Create `ilx_tenantsetting` record | `ilx_aadtenantid` = External ID tenant GUID (ilogixidentity Overview), `ilx_subscriptiontier = Trial`, `ilx_isactive = true` |
| 6 | User self-registers | User clicks **Start free trial** on login page → enters email + password + profile details in External ID user flow |
| 7 | Backend validates | On first API call, `GetCurrentUser` resolves `tid` to the trial tenant record, checks email domain is not personal (gmail, hotmail, etc.) |
| 8 | Convert to corporate | When trial user's company subscribes, create a full corporate tenant record (Section 13A) using their company AAD Tenant ID |

> **Important:** The trial `ilx_tenantsetting` record uses the **External ID tenant GUID** as its `ilx_aadtenantid` — not the user's company AAD. All trial users share this one record.

---

## 15. Troubleshooting

| Problem | Symptom | Resolution |
|---|---|---|
| Tenant not found | User receives 404 on login | Check `ilx_tenantsetting` in Master Dataverse. Verify `ilx_aadtenantid` matches and `ilx_isactive = true` |
| Dataverse connection failed — AADSTS | `ServiceClient.IsReady = false`, error contains `AADSTS65001` | Dynamics CRM `user_impersonation` permission missing or admin consent not granted. Entra ID → Qubix Insight API → API permissions → grant consent |
| Dataverse connection failed — 401 | `ServiceClient.IsReady = false`, error contains `Unauthorized` | App not registered as Application User in the target Dataverse environment |
| Function App will not start | Functions host fails to initialise, no functions listed in portal | `AzureWebJobsStorage` missing or invalid |
| Unable to determine tenant from Bearer token | API returns 401 | JWT lacks `tid` claim. Ensure MSAL acquires tokens scoped to the backend API (`api://...`), not Microsoft Graph |
| `Qubix_BlobBaseUrl` wrong format | Exception on document upload | Format must be `https://<account>.blob.core.windows.net` — no trailing slash, no container name |
| SAS generation fails (403) | `GenerateUserDelegationSasAsync` throws | Function App Managed Identity missing **Storage Blob Delegator** role on the document storage account |
| Azure OpenAI 429 | AI extraction returns Too Many Requests | Increase tokens-per-minute quota in Azure OpenAI Studio → Deployments → Manage quota |
| CORS error in browser | `Access-Control-Allow-Origin` error | Add SWA URL to Functions CORS allowed origins; enable Access-Control-Allow-Credentials |
| Trial user — personal email blocked | API returns 401 with "Please sign up with a work email address" | Expected behaviour. User must register with a company email address |
| Trial button disabled on login page | **Start free trial** button appears greyed out | `externalIdClientId` is empty or missing in `public/config.json`. Set the GUID from the External ID app registration |
| External ID redirect fails — AADSTS50011 | Error after successful account creation | Redirect URI not registered in the External ID app registration. Add the SWA URL as a **Single-page application** redirect URI in `ilogixidentity` tenant → App registrations → Qubix Insight Trial App → Authentication |
| Display name blank on new trial users | `userName` returned as empty string from `GetCurrentUser` | User flow missing `displayName` / `givenName` in User Attributes. Go to User flows → `QubixSignUpSignIn` → Page layouts → tick `givenName` + `surname` → Save |
| Trial tenant accessing Compare mode | Backend returns 403 Forbidden | Expected. Update `ilx_subscriptiontier` to `Standard` in Master Dataverse |
| Function App deployment — SubscriptionIsOverQuotaForSku | Quota error during creation | Change region to UK West. Request quota increase: Subscriptions → Usage + quotas → UK South → request 4 vCPUs |

---

*Qubix Insight — Azure Infrastructure Setup Guide v1.3 — June 2026 — Confidential*
