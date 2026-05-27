import { PublicClientApplication } from "@azure/msal-browser";

let _instance = null;

// Proxy delegates to the real instance once initAuth() has been called.
// All existing imports (msalInstance.getActiveAccount() etc.) keep working.
export const msalInstance = new Proxy({}, {
  get(_target, prop) {
    if (!_instance) throw new Error(`[Auth] MSAL not initialised — cannot call msalInstance.${String(prop)}`);
    const val = _instance[prop];
    return typeof val === "function" ? val.bind(_instance) : val;
  },
  set(_target, prop, value) {
    if (!_instance) throw new Error("[Auth] MSAL not initialised");
    _instance[prop] = value;
    return true;
  },
});

// Mutable object — initAuth() updates scopes in place so existing imports stay valid.
export const loginRequest = { scopes: [] };

// Called once from index.tsx after config.json is loaded.
export async function initAuth(config) {
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
