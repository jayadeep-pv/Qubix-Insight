# Qubix Insight — Identity Management Architecture

**Version 1.1 | June 2026 | Confidential**

---

## What's New in v1.1

| Area | Change |
|---|---|
| Trial UX | New Section 9: Trial User Frontend Experience — isTrial flag, read-only forms, TrialGuard, upgrade path |
| Activation | Checklist updated: items 5–8 still pending (trial Dataverse, branding, page heading) |

---

## 1. Overview

Qubix Insight supports two distinct authentication paths serving different user populations:

| Path | Users | Identity Provider | MSAL Instance |
|---|---|---|---|
| **Corporate login** | Existing company employees | Microsoft Entra ID (main tenant) | `msalInstance` |
| **Trial sign-up / login** | New users evaluating the platform | Microsoft Entra External ID (CIAM) | `_externalIdInstance` |

Both paths resolve to the same backend API, the same tenant lookup in Dataverse (`ilx_tenantsetting`), and the same feature gate logic. The identity provider determines only how the user authenticated — not what they can access (subscription tier does that).

---

## 2. Authentication Flows

### 2.1 Corporate User Flow

```
User clicks "Sign in with Microsoft"
         │
         ▼
MSAL → login.microsoftonline.com/{authorityTenantId}
         │
         ├─ Redirects back to SWA with authorization code
         │
         ▼
MSAL exchanges code → Access token
  - audience:  api://ba5f6329-ac7b-49d6-a9df-a05e9c84f422
  - tid claim: user's company AAD tenant GUID
  - scope:     qubixinsightapi.access
         │
         ▼
Frontend sends Bearer token → Azure Functions
         │
         ▼
Backend: JwtTenantExtractor reads tid claim
  → Looks up ilx_tenantsetting WHERE ilx_aadtenantid = tid
  → Resolves: TenantName, SubscriptionTier, DataverseUrl, BlobContainer
         │
         ▼
GetCurrentUser returns: isTrial, tenantName, subscriptionTier, userEmail, userName
```

### 2.2 Trial User Flow

```
User clicks "Start free trial"
         │
         ▼
MSAL (External ID instance) → ilogixidentity.ciamlogin.com
         │
         ├─ New user: redirected to QubixSignUpSignIn user flow
         │    Collects: email, password, given name, surname, company name, job title, country
         │
         ├─ Returning user: standard sign-in
         │
         ├─ Redirects back to SWA
         │
         ▼
handleRedirectPromise() called in index.tsx BEFORE React renders
  → account set via setActiveAccount()
         │
         ▼
MSAL acquires ID token (not access token)
  - scopes:    openid, profile, email
  - tid claim: External ID tenant GUID (ilogixidentity)
  - name claim: user's display name
  - email claim: user's email address
         │
         ▼
Frontend sends Bearer token (ID token) → Azure Functions
         │
         ▼
Backend: JwtTenantExtractor reads tid claim
  → tid = External ID tenant GUID
  → Looks up ilx_tenantsetting WHERE ilx_aadtenantid = External ID GUID
  → Resolves trial tenant record: IsTrial=true, DataverseUrl, BlobContainer
         │
         ├─ Email domain check: is domain in BlockedDomains?
         │    YES → 401 "Please sign up with a work email address"
         │    NO  → continue
         │
         ▼
GetCurrentUser returns: isTrial=true, tenantName, subscriptionTier="Trial", userEmail, userName
```

---

## 3. Frontend Dual MSAL Architecture

### 3.1 Why Two MSAL Instances

Each `PublicClientApplication` instance is bound to exactly one authority (one Azure directory). Corporate users authenticate against `login.microsoftonline.com`; trial users authenticate against `ilogixidentity.ciamlogin.com`. These are separate directories with separate token caches. A single MSAL instance cannot serve both.

### 3.2 Initialisation Sequence (index.tsx)

```
1. Fetch /config.json
2. initAuth(config)          → creates corporate MSAL instance, calls initialize()
3. initExternalIdAuth(config) → creates External ID MSAL instance (no-op if externalIdClientId absent)
4. extId.handleRedirectPromise() → processes External ID redirect BEFORE React renders
   → sets active account if redirect result contains one
5. root.render(<App />)
```

Processing the External ID redirect **before** `root.render()` is critical. It makes `getAllAccounts()` synchronous and reliable, eliminating a flash-of-login-page race condition.

The corporate MSAL redirect is handled automatically by `MsalProvider` from `@azure/msal-react`.

### 3.3 Proxy Pattern for msalInstance

`public/config.json` is fetched asynchronously at startup. `PublicClientApplication` cannot be constructed until that resolves. However, `msalInstance` is imported statically across many modules at load time.

The Proxy pattern solves this: every import receives a reference immediately, but any property access throws if `initAuth()` has not yet run. Once `initAuth()` completes, all existing references start working — no re-import or prop-drilling required.

```typescript
// src/authConfig.ts
export const msalInstance = new Proxy({} as PublicClientApplication, {
  get(_target, prop) {
    if (!_instance) throw new Error(`[Auth] MSAL not initialised — cannot call msalInstance.${String(prop)}`);
    const val = (_instance as any)[prop];
    return typeof val === 'function' ? val.bind(_instance) : val;
  },
});
```

### 3.4 Feature Flag: Trial Button

The **Start free trial** button is enabled only when `getExternalIdInstance() !== null`. This returns `null` until `initExternalIdAuth()` runs with a non-empty `externalIdClientId`. Setting `externalIdClientId` to an empty string in `config.json` disables the button without any code change.

```typescript
// src/App.tsx
onTrialLogin={getExternalIdInstance() ? handleTrialLogin : undefined}
```

### 3.5 resolveActiveAuth Helper

Both `configApi.ts` (axios interceptors) and `UserContext.tsx` use an identical `resolveActiveAuth()` helper to determine which MSAL instance and account to use for token acquisition:

```typescript
function resolveActiveAuth() {
  // Corporate users first
  const mainAccount = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (mainAccount) return { account: mainAccount, instance: msalInstance, request: loginRequest };

  // Trial users fallback
  const extId = getExternalIdInstance();
  if (extId) {
    const extAccount = extId.getActiveAccount() ?? extId.getAllAccounts()[0];
    if (extAccount) return { account: extAccount, instance: extId, request: trialLoginRequest };
  }
  return null;
}
```

`loginRequest` uses the API scope (`qubixinsightapi.access`) to obtain an access token.
`trialLoginRequest` uses OIDC scopes (`openid profile email`) to obtain an ID token — no API scope grant is needed because the backend reads JWT claims directly.

---

## 4. Token Strategy

### 4.1 Corporate Users — Access Token

| Field | Value |
|---|---|
| Token type | Access token |
| Scopes | `api://ba5f6329-ac7b-49d6-a9df-a05e9c84f422/qubixinsightapi.access` |
| Audience | Backend API app registration |
| Key claims | `tid` (company AAD tenant), `upn` (email), `name` |
| Validity | ~60 minutes; MSAL renews silently |

### 4.2 Trial Users — ID Token

| Field | Value |
|---|---|
| Token type | ID token (used as Bearer) |
| Scopes | `openid profile email` |
| Audience | External ID app registration (client ID) |
| Key claims | `tid` (External ID tenant GUID), `email`, `name` |
| Validity | ~60 minutes; MSAL renews silently |

> **Why an ID token for trial users?** Trial users are in a separate Azure directory. Granting them access to the backend API scope would require cross-tenant API permission setup which is complex and unnecessary. The backend uses `JwtTenantExtractor` to read the `tid` claim directly from whichever token it receives — it does not validate the audience strictly for tenant resolution purposes.

---

## 5. Backend Tenant Resolution

### 5.1 JwtTenantExtractor

Reads claims from the Bearer token without full signature validation (validation is enforced by the Azure Functions host middleware):

- `tid` → Azure AD Tenant ID
- `email` or `preferred_username` → user email
- `name` → display name

### 5.2 TenantResolverService

Looks up `ilx_tenantsetting` in the Master Dataverse using `ilx_aadtenantid = tid`. Returns a `TenantSettings` object with:

- `TenantName`
- `SubscriptionTier` (Trial / Standard / Enterprise)
- `IsTrial` (derived: `SubscriptionTier == "Trial"`)
- `DataverseUrl`
- `BlobContainerName`

### 5.3 GetCurrentUser Function

The first call made by the frontend after authentication. It:

1. Extracts user info from the JWT (`tid`, email, name)
2. Resolves the tenant from `ilx_tenantsetting`
3. For trial tenants: checks if the email domain is in the `BlockedDomains` list
4. Returns: `isTrial`, `tenantName`, `subscriptionTier`, `userEmail`, `userName`

**Blocked personal email domains** (enforced in `GetCurrentUser.cs`):

```
gmail.com, googlemail.com
hotmail.com, hotmail.co.uk, hotmail.fr
outlook.com, live.com, live.co.uk, msn.com
yahoo.com, yahoo.co.uk, yahoo.fr
icloud.com, me.com, mac.com
protonmail.com, proton.me
zoho.com, aol.com, ymail.com
```

To add more domains: edit the `BlockedDomains` `HashSet` in `backend/GetCurrentUser.cs` and redeploy.

---

## 6. Entra External ID Configuration

### 6.1 Tenant Details

| Field | Value |
|---|---|
| Tenant name | `ilogixidentity` |
| Domain | `ilogixidentity.onmicrosoft.com` |
| Authority | `https://ilogixidentity.ciamlogin.com/` |
| Tenant GUID | Found in ilogixidentity → Entra ID → Overview |
| Type | External (CIAM) |

### 6.2 User Flow

| Field | Value |
|---|---|
| Flow name | `QubixSignUpSignIn` |
| Type | Sign up and sign in |
| Identity providers | Email with password |

### 6.3 Collected User Attributes

| Attribute | Required | Description |
|---|---|---|
| Email Address | ✅ | Primary identifier |
| Given Name | ✅ | First name |
| Surname | ✅ | Last name |
| Display Name | — | Auto-composed from given + surname |
| Company Name | ✅ | Organisation name; description shown to user: *"Enter the name of your organisation or business."* |
| Job Title | — | Lead qualification |
| Country/Region | — | Data residency context |

### 6.4 App Registration

| Field | Value |
|---|---|
| App name | Qubix Insight Trial App |
| Client ID | `a7d39fd7-3fc6-459b-b2a3-a735fe40b989` |
| Redirect URIs (SPA) | `https://witty-mushroom-08917f703.azurestaticapps.net`, `http://localhost:3000` |
| API permissions | None (ID token only — no API scope grant required) |

### 6.5 Company Branding

| Setting | Value |
|---|---|
| Sign-in page text | `Qubix Insight` |
| Page heading (via Languages JSON) | `Qubix Insight Registration` |

---

## 7. Key Files

| File | Purpose |
|---|---|
| `src/authConfig.ts` | MSAL instance creation, Proxy pattern, `initAuth()`, `initExternalIdAuth()`, `getExternalIdInstance()` |
| `src/appConfig.ts` | `AppConfig` interface including optional `externalIdClientId` |
| `src/index.tsx` | Async bootstrap: fetches config, inits both MSAL instances, processes External ID redirect, then renders |
| `src/App.tsx` | `handleTrialLogin`, `handleLogout` (dual-instance aware), `extIdAuthenticated` state |
| `src/services/configApi.ts` | Axios interceptors using `resolveActiveAuth()` for token injection and 401 retry |
| `src/context/UserContext.tsx` | `UserProvider` with `resolveActiveAuth()` for `GetCurrentUser` fetch; checks both MSAL instances for auth state |
| `public/config.json` | Runtime config: all four MSAL values + `externalIdClientId` |
| `backend/GetCurrentUser.cs` | Tenant resolution, email domain blocking, user info response |
| `backend/JwtTenantExtractor.cs` | JWT claim extraction (`tid`, email, name) |
| `backend/Services/TenantResolverService.cs` | Dataverse lookup by `ilx_aadtenantid` |

---

## 8. Activation Checklist

To enable the trial login button (currently active if `externalIdClientId` is set):

| # | Item | Status |
|---|---|---|
| 1 | `ilogixidentity` External ID tenant created | ✅ Done |
| 2 | `QubixSignUpSignIn` user flow created with attributes | ✅ Done |
| 3 | External ID app registration with SPA redirect URIs | ✅ Done |
| 4 | `externalIdClientId` set in `public/config.json` | ✅ Done |
| 5 | Trial `ilx_tenantsetting` record in Master Dataverse with External ID tenant GUID | ⬜ Pending — create record |
| 6 | Trial Dataverse environment provisioned with solution + Application User | ⬜ Pending |
| 7 | Company branding (sign-in page text, logo) | ⬜ Pending — set "Qubix Insight" |
| 8 | Page heading set to "Qubix Insight Registration" via Languages JSON | ⬜ Pending |
| 9 | Backend deployed with `GetCurrentUser.cs` email domain blocking | ✅ Done (deploy via VS Code Azure Functions extension) |

---

## 9. Trial User Frontend Experience

### 9.1 The `isTrial` Flag

`GetCurrentUser` returns `isTrial: boolean`. The `UserContext` React context propagates this flag to every component. It is the single source of truth for frontend access control. The flag is `true` whenever the resolved `ilx_tenantsetting` record has `ilx_subscriptiontier = Trial`.

### 9.2 UI Indicators and Restrictions

| Element | Trial Behaviour |
|---|---|
| Topbar (right side) | "Trial" badge displayed next to tenant/user name (blue pill); clicking navigates to `/support` |
| Admin form pages | Yellow read-only banner: *"Trial account — this record is read only. Upgrade to enable editing."* |
| Admin form fields | All `input`, `select`, `textarea` visually disabled — grey background, `pointer-events: none` |
| Admin Save buttons | `disabled` attribute set; tooltip: *"Not available on trial"* |
| Run screen — Compare mode | Card greyed out; "Upgrade →" label shown instead of "Start →" |
| Run screen — Scoring mode | Card greyed out; "Upgrade →" label shown instead of "Start →" |
| Discovery | Available to trial users — no restriction |
| Summarise | Available to trial users — no restriction |

### 9.3 Read-Only Admin Forms

The CSS class `admin-form-card--readonly` is applied to every admin form card (`DocumentTypeForm`, `ComparisonTemplateForm`, `TemplateAttributeForm`, `RuleForm`, `AiInsightProfileForm`) when `isTrial === true`.

**CSS enforcement (`src/styles/admin.css`):**

```css
.admin-form-card--readonly .form-input,
.admin-form-card--readonly input:not([type="submit"]):not([type="button"]):not([type="checkbox"]),
.admin-form-card--readonly select,
.admin-form-card--readonly textarea {
  pointer-events: none;
  background-color: #f9fafb;
  color: #6b7280;
  cursor: default;
  border-color: #e5e7eb;
}
.admin-form-card--readonly input[type="checkbox"] {
  pointer-events: none;
  opacity: 0.6;
}
```

This is a **UI convenience layer only**. All write operations are independently enforced at the backend — trial tenants receive HTTP 403 on any mutation endpoint regardless of the frontend state.

### 9.4 TrialGuard Route Protection

`TrialGuard` wraps protected routes in `App.tsx`. When `isTrial === true`, it immediately redirects to `/home`, preventing trial users from reaching administration pages via direct URL navigation.

```tsx
function TrialGuard({ children }: { children: ReactNode }) {
  const { isTrial, loading } = useUser();
  if (loading) return null;
  if (isTrial) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
```

Administration routes (`/document-types`, `/comparison-templates`, `/admin/template-attributes`, `/admin/rules`, `/admin/ai-insight-profiles`) are each wrapped in `<TrialGuard>`.

### 9.5 Upgrading a Trial User to Corporate Subscription

When a trial user's company subscribes:

| Step | Action |
|---|---|
| 1 | Provision a Dataverse environment for the company (see Section 13A of the Deployment Guide) |
| 2 | Create a new `ilx_tenantsetting` record using the company's **own** Azure AD Tenant GUID as `ilx_aadtenantid` |
| 3 | Set `ilx_subscriptiontier` to `Standard` or `Enterprise` |
| 4 | The user signs in via **Sign in with Microsoft** (corporate button) — not the trial button |

The trial `ilx_tenantsetting` record (keyed to the External ID tenant GUID) remains unchanged and continues to serve other trial users.

---

*Qubix Insight — Identity Management Architecture v1.1 — June 2026 — Confidential*
