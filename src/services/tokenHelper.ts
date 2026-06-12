import { IPublicClientApplication, InteractionStatus, AccountInfo } from "@azure/msal-browser";
import { loginRequest, getExternalIdInstance } from "../authConfig";

/**
 * Returns the current access token for any authenticated user.
 * For CIAM (External ID) trial users, uses the token stored in sessionStorage
 * after the redirect — MSAL v5 acquireTokenSilent throws authority_mismatch
 * for ciamlogin.com tenants even when the authority is correct.
 */
export async function getAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null | undefined,
  inProgress?: InteractionStatus
): Promise<string | null> {
  const extId = getExternalIdInstance();
  const fallbackReload = () => { sessionStorage.clear(); localStorage.clear(); window.location.reload(); };

  if (extId && extId.getAllAccounts().length > 0) {
    const stored = sessionStorage.getItem("extid_token");
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && (!parsed.expiresOn || new Date(parsed.expiresOn) > new Date())) {
      return parsed.accessToken;
    }
    extId.loginRedirect({ scopes: ["openid", "profile", "email"] }).catch(fallbackReload);
    return null;
  }

  if (!account) return null;
  if (inProgress && inProgress !== InteractionStatus.None) return null;

  try {
    const response = await instance.acquireTokenSilent({ ...loginRequest, account });
    return response.accessToken;
  } catch {
    try {
      await instance.acquireTokenRedirect({ ...loginRequest, account });
    } catch {
      fallbackReload();
    }
    return null;
  }
}
