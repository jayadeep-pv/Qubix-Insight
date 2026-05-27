import { PublicClientApplication } from "@azure/msal-browser";

const clientId = process.env.REACT_APP_CLIENT_ID;
const apiScope = process.env.REACT_APP_API_SCOPE;
const authorityTenantId = process.env.REACT_APP_AUTHORITY_TENANT_ID || "common";

if (!clientId) console.warn("[Auth] REACT_APP_CLIENT_ID is not set");
if (!apiScope) console.warn("[Auth] REACT_APP_API_SCOPE is not set");

export const msalConfig = {
  auth: {
    clientId: clientId,
    // "common" allows users from ANY Azure AD tenant to sign in.
    // Set REACT_APP_AUTHORITY_TENANT_ID to lock to a specific tenant.
    authority: `https://login.microsoftonline.com/${authorityTenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

// Scopes requested on every token acquisition.
// The backend reads the tid claim to resolve the tenant.
export const loginRequest = {
  scopes: apiScope ? [apiScope] : []
};

export const msalInstance = new PublicClientApplication(msalConfig);
