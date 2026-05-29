import { PublicClientApplication } from "@azure/msal-browser";
import type { AppConfig } from "./appConfig";

// ─── Main Azure AD instance ──────────────────────────────────────────────────

let _instance: PublicClientApplication | null = null;

// Proxy typed as PublicClientApplication so all existing call-sites type-check.
// Delegates to the real instance once initAuth() has been called.
export const msalInstance = new Proxy({} as PublicClientApplication, {
  get(_target, prop) {
    if (!_instance) throw new Error(`[Auth] MSAL not initialised — cannot call msalInstance.${String(prop)}`);
    const val = (_instance as any)[prop];
    return typeof val === "function" ? val.bind(_instance) : val;
  },
  set(_target, prop, value) {
    if (!_instance) throw new Error("[Auth] MSAL not initialised");
    (_instance as any)[prop] = value;
    return true;
  },
}) as PublicClientApplication;

// Mutable object — initAuth() updates scopes in place so existing imports stay valid.
export const loginRequest: { scopes: string[] } = { scopes: [] };

// Called once from index.tsx after config.json is loaded.
export async function initAuth(config: AppConfig): Promise<PublicClientApplication> {
  _instance = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.authorityTenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage",
    },
  });

  loginRequest.scopes = [config.apiScope];
  await _instance.initialize();
  return _instance;
}

// ─── Entra External ID instance (trial users) ────────────────────────────────

let _externalIdInstance: PublicClientApplication | null = null;

export const trialLoginRequest = { scopes: ["openid", "profile", "email"] };

/** Returns the External ID instance, or null if not yet configured (Phase 3 pending). */
export function getExternalIdInstance(): PublicClientApplication | null {
  return _externalIdInstance;
}

/**
 * Initialises the Entra External ID MSAL instance from runtime config.
 * No-op when externalIdClientId is absent — the trial button stays disabled
 * until Phase 3 Azure portal setup is complete and the client ID is set.
 */
export async function initExternalIdAuth(config: AppConfig): Promise<void> {
  if (!config.externalIdClientId) return;

  _externalIdInstance = new PublicClientApplication({
    auth: {
      clientId: config.externalIdClientId,
      authority: "https://ilogixidentity.ciamlogin.com/",
      redirectUri: window.location.origin.includes("localhost")
        ? "http://localhost:3000"
        : "https://witty-mushroom-08917f703.7.azurestaticapps.net",
      knownAuthorities: ["ilogixidentity.ciamlogin.com"],
    },
    cache: {
      cacheLocation: "localStorage",
    },
  });

  await _externalIdInstance.initialize();
}
