# Qubix Insight — Custom Domain Setup Guide

**Version 1.0 | August 2026 | Confidential**

---

## Purpose

This document records every step taken to connect the purchased domain **QubixInsight.ai** to the Qubix Insight production environment, including all configuration changes made in Azure, Cloudflare, Hostinger, Dataverse, and the frontend codebase.

---

## 1. Overview of Components Changed

| Component | Change Made |
|---|---|
| Azure Static Web App | Custom domains added: www.qubixinsight.ai and qubixinsight.ai |
| Azure Function App | Custom domain added: api.qubixinsight.ai |
| Azure Function App CORS | Added qubixinsight.ai and www.qubixinsight.ai as allowed origins |
| Azure Blob Storage CORS | Added qubixinsight.ai and www.qubixinsight.ai as allowed origins |
| Azure Entra ID (Main) | Added new redirect URIs for both custom domain variants |
| Azure Entra ID (External ID) | Added new redirect URIs for trial login |
| Cloudflare | DNS provider configured with CNAME flattening for root domain |
| Hostinger | Nameservers updated to point to Cloudflare |
| Dataverse | Tenant Setting record created for production environment |
| Frontend — config.json | apiBase updated to https://api.qubixinsight.ai/api |
| Frontend — authConfig.ts | External ID redirectUri changed from hardcoded URL to dynamic |

---

## 2. Domain Registration

The domain **qubixinsight.ai** was purchased via Hostinger. The domain registrar is Hostinger and DNS was initially managed by Hostinger nameservers (ns1.hostinger.com / ns2.hostinger.com).

---

## 3. Why Cloudflare Was Required

Hostinger does not support ALIAS or ANAME records, and DNS standards prohibit CNAME records at the root apex domain (@). Azure Static Web Apps requires either a CNAME, ALIAS, or a static IP (A record) for routing — none of which Hostinger could provide for the root domain.

**Solution:** Cloudflare was introduced as the DNS provider. Cloudflare supports CNAME Flattening — it resolves a CNAME at the root internally and serves a valid A record to the outside world. This satisfies both the DNS standard and Azure's routing requirement.

Hostinger's URL redirect feature was also attempted but rejected the root-to-www redirect with "You cannot redirect your domain to itself."

---

## 4. Cloudflare Setup

### 4.1 Account and Domain

- Sign up at cloudflare.com (Free plan)
- Add site: qubixinsight.ai
- Select Free plan

### 4.2 DNS Records Configured

Cloudflare imported existing Hostinger DNS records. The old A record pointing to Hostinger's parking IP (2.57.91.91) was deleted and replaced with the following:

| Type | Name | Content | Proxy Status |
|---|---|---|---|
| CNAME | @ (root) | witty-mushroom-08917f703.7.azurestaticapps.net | DNS only (OFF) |
| CNAME | www | witty-mushroom-08917f703.7.azurestaticapps.net | DNS only (OFF) |
| CNAME | api | func-ilogix-qubixinsight-prod-uks-caafa7bgdse0d2fr.ukwest-01.azurewebsites.net | DNS only (OFF) |
| TXT | @ | Azure ownership verification token (first attempt) | DNS only |
| TXT | @ | Azure ownership verification token (second attempt — re-add) | DNS only |
| TXT | asuid.api | Azure Function App ownership verification token | DNS only |

**Important:** The Proxy status must be set to OFF (grey cloud — DNS only) for all records. Azure manages SSL certificates itself and Cloudflare proxying interferes with Azure certificate validation.

**Critical lesson:** The root CNAME target must include the regional suffix .7. — the correct target is witty-mushroom-08917f703.7.azurestaticapps.net, NOT witty-mushroom-08917f703.azurestaticapps.net. Using the wrong target caused a persistent Azure 404 error even after DNS propagated.

### 4.3 Nameserver Change in Hostinger

After configuring DNS in Cloudflare, the nameservers in Hostinger were updated:

- Navigate to: Hostinger → Domains → Manage → DNS/Nameservers → Nameservers tab
- Switch to Custom nameservers
- Replace ns1.hostinger.com / ns2.hostinger.com with the two Cloudflare nameservers provided (e.g. frida.ns.cloudflare.com and milan.ns.cloudflare.com — exact names assigned by Cloudflare)
- Save

Nameserver propagation typically takes 1–4 hours.

---

## 5. Azure Static Web App — Custom Domains

The frontend React application is deployed to Azure Static Web App: **witty-mushroom-08917f703** (stapp-ilogix-qubixinsight-prod-uks).

Default URL: https://witty-mushroom-08917f703.azurestaticapps.net

### 5.1 Adding www.qubixinsight.ai

- Azure Portal → Static Web App → Custom domains → Add → Custom domain on other DNS
- Domain: www.qubixinsight.ai
- Hostname record type: CNAME
- Azure provided a CNAME record to add in DNS (already present in Cloudflare)
- Status moved to Validated automatically
- SSL certificate provisioned automatically (expiry 2027-02-01)

### 5.2 Adding qubixinsight.ai (Root Domain)

Root domain setup required two phases:

**Phase 1 — Ownership verification (TXT record)**

- Azure Portal → Static Web App → Custom domains → Add → Custom domain on other DNS
- Domain: qubixinsight.ai
- Hostname record type: TXT
- Azure generated a TXT token — added to Cloudflare DNS at @ (root)
- Status moved to Validated

**Phase 2 — Traffic routing (CNAME record)**

After TXT validation, Azure displayed "Add a CNAME, ALIAS or A record." The CNAME @ record in Cloudflare (pointing to the .7. endpoint) satisfies this requirement via Cloudflare CNAME Flattening.

**SSL certificate re-issue:** The first SSL certificate issued for qubixinsight.ai was invalid in the browser (NET::ERR_CERT_COMMON_NAME_INVALID) because it was provisioned before the CNAME was corrected to use the .7. regional suffix. Resolution:

- Delete qubixinsight.ai from Azure custom domains
- Re-add using Custom domain on other DNS
- A new TXT ownership token was generated and added to Cloudflare
- Azure validated and issued a fresh certificate (expiry 2027-02-07)

### 5.3 Final Custom Domain Status

| Domain | Status | Type | SSL Expiry |
|---|---|---|---|
| witty-mushroom-08917f703.azurestaticapps.net | Validated | Auto-generated | — |
| www.qubixinsight.ai | Validated | Custom domain | 2027-02-01 |
| qubixinsight.ai | Validated | Custom domain | 2027-02-07 |

---

## 6. Azure Function App — Custom Domain (api.qubixinsight.ai)

The backend Azure Function App URL was previously the auto-generated azurewebsites.net URL. A custom domain was added for a cleaner API endpoint.

Function App: **func-ilogix-qubixinsight-prod-uks-caafa7bgdse0d2fr**

### 6.1 DNS Records in Cloudflare

Two records were added to Cloudflare:

| Type | Name | Content |
|---|---|---|
| CNAME | api | func-ilogix-qubixinsight-prod-uks-caafa7bgdse0d2fr.ukwest-01.azurewebsites.net |
| TXT | asuid.api | Azure-provided ownership verification token |

### 6.2 Azure Portal Steps

- Function App → Custom domains → Add custom domain
- Domain provider: All other domain services
- TLS/SSL certificate: App Service Managed Certificate (free)
- TLS/SSL type: SNI SSL
- Custom domain: api.qubixinsight.ai
- Validate — both CNAME and TXT show green ticks
- Click Add
- Status changes from No binding to Secured within 10 minutes

---

## 7. Azure CORS Configuration

### 7.1 Function App CORS

The Function App must allow requests from the new custom domain origins.

- Azure Portal → Function App → API → CORS
- Added allowed origins:
  - https://qubixinsight.ai
  - https://www.qubixinsight.ai
- Ensure Access-Control-Allow-Credentials is enabled
- Click Save (takes effect immediately, no restart required)

Note: The backend host.json file contains localhost CORS entries for local development only. Production CORS is managed entirely in the Azure Portal and overrides host.json.

### 7.2 Azure Blob Storage CORS

PDF documents are fetched directly from Azure Blob Storage by the browser. The storage account requires separate CORS configuration.

Storage account: **sailogixqubixproduks**

- Azure Portal → Storage accounts → sailogixqubixproduks → Resource sharing (CORS) → Blob service tab
- Added two rows:

| Allowed origins | Allowed methods | Allowed headers | Exposed headers | Max age |
|---|---|---|---|---|
| https://www.qubixinsight.ai | GET, OPTIONS | * | * | 3600 |
| https://qubixinsight.ai | GET, OPTIONS | * | * | 3600 |

- Click Save (takes effect immediately)

Without this change, PDF documents failed to load with: Access to fetch blocked by CORS policy: No Access-Control-Allow-Origin header is present on the requested resource.

---

## 8. Azure Entra ID — App Registration Updates

Both app registrations require the new domain added as redirect URIs. Without this, MSAL login fails with a redirect URI mismatch error.

### 8.1 Main App Registration

Client ID: c9e00263-aebc-4d59-ad9e-7e6b00d4fc89
Tenant: 91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d

- Azure Portal → Entra ID → App registrations → Qubix Insight app
- Authentication → Redirect URIs → Add URI:
  - https://qubixinsight.ai
  - https://www.qubixinsight.ai
- Save

### 8.2 External ID App Registration (Trial Login)

Client ID: a7d39fd7-3fc6-459b-b2a3-a735fe40b989
Tenant: 8ffa5d33-d943-4f66-b78c-83998b17c8cb (External ID tenant)

- Switch to the External ID tenant in Azure Portal
- App registrations → External ID trial app
- Authentication → Redirect URIs → Add URI:
  - https://qubixinsight.ai
  - https://www.qubixinsight.ai
- Save

---

## 9. Frontend Code Changes

### 9.1 public/config.json — API Base URL

The apiBase was updated from the long auto-generated Function App URL to the custom domain:

Before:
```
"apiBase": "https://func-ilogix-qubixinsight-prod-uks-caafa7bgdse0d2fr.ukwest-01.azurewebsites.net/api"
```

After:
```
"apiBase": "https://api.qubixinsight.ai/api"
```

### 9.2 src/authConfig.ts — External ID Redirect URI

The External ID MSAL instance had the redirectUri hardcoded to the old Static Web App URL. This caused sign-in to redirect back to the old domain instead of the custom domain.

Before:
```
redirectUri: window.location.origin.includes("localhost")
  ? "http://localhost:3000"
  : "https://witty-mushroom-08917f703.7.azurestaticapps.net",
```

After:
```
redirectUri: window.location.origin,
```

Using window.location.origin makes the redirect URI dynamic — it automatically uses whatever domain the app is running on, whether localhost, the azurestaticapps.net URL, or the custom domain.

### 9.3 Deployment

Changes were committed and pushed to the main branch. GitHub Actions workflow (azure-static-web-apps-witty-mushroom-08917f703.yml) automatically built and deployed the updated frontend to the Static Web App.

---

## 10. Dataverse — Production Tenant Setup

### 10.1 Function App Environment Variables

The backend TenantResolverService uses separate configuration keys to connect to the master Dataverse for tenant lookups. These must be set on the Function App:

- Azure Portal → Function App → Environment variables
- Qubix_MainDataverseUrl: production Dataverse URL
- Qubix_ClientId: app registration client ID
- Qubix_ClientSecret: app registration client secret
- Qubix_TenantId: 91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d
- DATAVERSE_URL: production Dataverse URL (used for per-tenant data operations)

### 10.2 Tenant Setting Record (ilx_tenantsetting)

Every company that accesses Qubix Insight must have a record in the ilx_tenantsetting table in the master Dataverse environment. The backend extracts the AAD tenant ID (tid claim) from the JWT and looks up this table. If no matching active record is found, the backend returns an error and the frontend immediately logs the user out.

**Symptom of missing record:** User signs in successfully, the home page appears briefly (1–2 seconds), then the app logs out and returns to the login page. The browser Network tab shows a logout redirect to login.microsoftonline.com immediately after the GetCurrentUser API call.

For each tenant (including the Qubix Insight company itself), create a record with these fields:

| Field | Description |
|---|---|
| ilx_tenantid | Internal business key (e.g. ILOGIXGLOBAL) |
| ilx_tenantname | Display name (e.g. iLogix Global) |
| ilx_aadtenantid | Azure AD tenant GUID from JWT tid claim |
| ilx_subscriptiontier | Choice value: Trial, Standard, or Enterprise |
| ilx_dataverseurl | Tenant's Dataverse environment URL |
| ilx_storageaccountname | Azure Storage account name |
| ilx_storagecontainername | Blob container name for documents |
| ilx_storagesassecretref | Key Vault secret name holding the SAS token |
| ilx_alloweddomains | Permitted email domains (comma-separated) |
| ilx_isactive | Must be true |
| ilx_onboardeddate | Onboarding date |

### 10.3 Trial Tenant Record

Trial users authenticate via Entra External ID (tenant 8ffa5d33-d943-4f66-b78c-83998b17c8cb). A single ilx_tenantsetting record with ilx_aadtenantid matching the External ID tenant GUID is required. Set ilx_subscriptiontier to Trial.

---

## 11. Troubleshooting Log

| Issue | Root Cause | Resolution |
|---|---|---|
| Hostinger has no ALIAS record | DNS standard prohibits CNAME at root; Hostinger has no ALIAS workaround | Switched DNS to Cloudflare which supports CNAME flattening |
| Hostinger redirect rejected | Hostinger blocks root-to-www self-redirect | Cloudflare used instead |
| Azure 404 Web Site not found after DNS change | Root CNAME pointed to witty-mushroom-08917f703.azurestaticapps.net (missing .7. regional suffix) | Updated CNAME target to witty-mushroom-08917f703.7.azurestaticapps.net |
| qubixinsight.ai shows Not Secure in browser | SSL cert issued before CNAME was corrected — cert covered wrong endpoint | Deleted and re-added qubixinsight.ai in Azure to trigger fresh cert issuance |
| App logs out immediately after login | ilx_tenantsetting record missing in production Dataverse for the user's AAD tenant | Created tenant record in Dataverse |
| PDFs not loading — CORS error | Azure Blob Storage CORS did not include new custom domain | Added both domains to Blob Storage CORS settings |
| Sign in redirecting to witty-mushroom URL | External ID MSAL redirectUri hardcoded to old Static Web App URL | Changed to window.location.origin in authConfig.ts |
| nslookup not returning TXT records | Windows nslookup has known issue with TXT lookups via local router DNS | Used PowerShell Resolve-DnsName against 1.1.1.1 to verify records |

---

## 12. Final DNS Records (Cloudflare)

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | @ (root) | witty-mushroom-08917f703.7.azurestaticapps.net | DNS only |
| CNAME | www | witty-mushroom-08917f703.7.azurestaticapps.net | DNS only |
| CNAME | api | func-ilogix-qubixinsight-prod-uks-caafa7bgdse0d2fr.ukwest-01.azurewebsites.net | DNS only |
| TXT | @ | Azure Static Web App ownership token (first) | DNS only |
| TXT | @ | Azure Static Web App ownership token (second — re-add) | DNS only |
| TXT | asuid.api | Azure Function App ownership token | DNS only |

---

## 13. Setup Checklist

- Cloudflare account created and qubixinsight.ai added
- Hostinger nameservers updated to Cloudflare nameservers
- CNAME records added for @ and www pointing to .7. Static Web App URL
- CNAME record added for api pointing to Function App URL
- TXT ownership records added for root and api subdomain
- www.qubixinsight.ai validated and SSL secured in Azure Static Web App
- qubixinsight.ai validated and SSL secured in Azure Static Web App
- api.qubixinsight.ai validated and SSL secured in Azure Function App
- Function App CORS updated with both custom domain origins
- Blob Storage CORS updated with both custom domain origins
- Main Entra ID app registration redirect URIs updated
- External ID app registration redirect URIs updated
- config.json apiBase updated to api.qubixinsight.ai
- authConfig.ts External ID redirectUri changed to window.location.origin
- Frontend deployed via GitHub Actions push to main branch
- Function App environment variables set for production Dataverse
- ilx_tenantsetting record created for each tenant in production Dataverse
- Trial tenant record created with External ID tenant GUID
