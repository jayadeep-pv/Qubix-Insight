import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: "7c876bbe-7293-49eb-bf81-54a46c665b77",
    // "common" allows users from ANY Azure AD tenant to sign in.
    // Do NOT use a single tenant GUID here — that would lock out all other tenants.
    authority: process.env.NODE_ENV === "production"
  ? "https://login.microsoftonline.com/common"
  : "https://login.microsoftonline.com/c957560e-8fc9-444a-9cde-bfd3129e36ad",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

// Scopes requested on every token acquisition.
// The backend will read the tid claim from this token to resolve the tenant.
export const loginRequest = {
  scopes: [
    "api://ff3fa124-94c0-431f-a573-b3c06b8865d9/hollisdocumentcomparisonapi.access"
  ]
};

export const msalInstance = new PublicClientApplication(msalConfig);