# Session Summary — May 2026

## What We Did This Session

### 1. Explained the authConfig.ts dual MSAL design
- Why two MSAL instances are needed (one per Azure directory)
- Why the Proxy pattern is used for `msalInstance` (async config loading)
- How the same redirect URI works for both auth flows
- How `handleRedirectPromise()` before `root.render()` eliminates flash-of-login

### 2. Deployed backend to Azure Functions
- Backend build confirmed clean (`dotnet build --configuration Release`)
- Azure CLI not installed — deployment options: VS Code Azure Functions extension or install `winget install --id Microsoft.AzureCLI -e`

### 3. Entra External ID — User Flow Attributes
- Added fields to `QubixSignUpSignIn` page layouts: givenName (required), surname (required), CompanyName (required), displayName, jobTitle, country
- CompanyName description text: *"Enter the name of your organisation or business."*
- Company branding must be configured before Languages customisation is available

### 4. Company Branding & Page Heading
- Company branding → Sign-in page text → `Qubix Insight` (overrides tenant name)
- Page heading change: User flows → Languages → English → Download defaults → edit `"heading"` key → Upload new overrides
- Languages page requires Company Branding Default to be set up first

### 5. OTP "code didn't work" Issue
- OTP is received in email but rejected — root cause: browser session expiry
- Fix: InPrivate window → enter email → paste code within 60 seconds
- Also check for stuck partial account in ilogixidentity → Users
- Test in isolation: User flows → Run user flow

### 6. OTP sender display name
- Comes from the tenant display name: Entra ID → Overview → Properties → Name → `Qubix Insight Identity`
- To change the actual from-address (future): Custom authentication extensions + Azure Communication Services

### 7. Updated all three Word documents

All in `c:\Projects\Document-Intelligence\docs\`:

| Document | Changes |
|---|---|
| `Qubix_Insight_Azure_Infrastructure_Setup_Guide.docx` | hollis_ → ilx_ rename, version 1.2, header/footer standardised |
| `Qubix_Insight_Deployment_Guide_v1.2.docx` | Full v1.2 — External ID section (4.4), dual onboarding, updated checklist & troubleshooting |
| `Identity_Management_Architecture.docx` | New — dual MSAL design, token strategy, External ID config, activation checklist |

Documents share the same style template, header (`Qubix Insight | Title | Confidential`), and footer.

To regenerate: `cd docs; .\BuildDocs.ps1`

---

## Outstanding Items

| Item | Status |
|---|---|
| Backend deploy to Azure (GetCurrentUser.cs email domain blocking) | Pending — use VS Code Azure Functions extension |
| Trial `ilx_tenantsetting` record in Master Dataverse | Pending — needs External ID tenant GUID |
| Trial Dataverse sandbox environment provisioned | Pending |
| Company branding logo uploaded | Pending |
| Page heading set to "Qubix Insight Registration" | Pending |
| OTP sender name → "Qubix Insight Identity" | Pending — change tenant display name |
| Custom email sender (from address) | Future — Custom authentication extensions setup |

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
