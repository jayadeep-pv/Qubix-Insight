import { PublicClientApplication } from "@azure/msal-browser";
import type { AppConfig } from "./appConfig";

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
      storeAuthStateInCookie: false,
    },
  });

  loginRequest.scopes = [config.apiScope];
  await _instance.initialize();
  return _instance;
}
