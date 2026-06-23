import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import axios from "axios";
import { msalInstance, loginRequest, trialLoginRequest, getExternalIdInstance } from "../authConfig";
import { getAppConfig } from "../appConfig";

// Data fields stored in state (no function references)
interface UserData {
  isTrial:         boolean;
  isAdmin:         boolean;
  userEmail:       string;
  userName:        string;
  firstName:       string;
  lastName:        string;
  companyName:     string;
  jobTitle:        string;
  country:         string;
  tenantName:      string;
  subscriptionTier: string;
  profileComplete: boolean;
  runsUsed:        number;
  runLimit:        number;
  trialExpiry:     string;
  trialExpired:    boolean;
  loading:         boolean;
}

// Context type adds refreshUser so consumers can re-fetch after a scan
export interface UserContextType extends UserData {
  refreshUser: () => void;
}

const defaultData: UserData = {
  isTrial:         false,
  isAdmin:         true,
  userEmail:       "",
  userName:        "",
  firstName:       "",
  lastName:        "",
  companyName:     "",
  jobTitle:        "",
  country:         "",
  tenantName:      "",
  subscriptionTier: "",
  profileComplete: true,
  runsUsed:        0,
  runLimit:        5,
  trialExpiry:     "",
  trialExpired:    false,
  loading:         true,
};

const UserContext = createContext<UserContextType>({ ...defaultData, refreshUser: () => {} });

export function useUser(): UserContextType {
  return useContext(UserContext);
}

/**
 * Resolves the active MSAL account and instance.
 * Prefers the main Azure AD instance; falls back to External ID for trial users.
 * Mirrors the same logic in configApi.ts so both always use the same token.
 */
function resolveActiveAuth() {
  const mainAccount = msalInstance.getActiveAccount()
    ?? msalInstance.getAllAccounts().find(a => !a.environment.includes("ciamlogin.com"));
  if (mainAccount) {
    return { account: mainAccount, instance: msalInstance, request: loginRequest };
  }
  const extId = getExternalIdInstance();
  if (extId) {
    const extAccount = extId.getActiveAccount() ?? extId.getAllAccounts()[0];
    if (extAccount) {
      return { account: extAccount, instance: extId, request: trialLoginRequest };
    }
  }
  return null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const [userData, setUserData] = useState<UserData>(defaultData);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const auth = resolveActiveAuth();
      if (!auth) {
        setUserData({ ...defaultData, loading: false });
        return;
      }

      // For CIAM (External ID) accounts use the token stored in sessionStorage
      // by index.tsx — acquireTokenSilent throws authority_mismatch for CIAM in MSAL v5.
      const isCiam = auth.account.environment.includes("ciamlogin.com");
      let accessToken: string;

      if (isCiam) {
        const stored = sessionStorage.getItem("extid_token");
        const parsed = stored ? JSON.parse(stored) : null;
        if (!parsed || (parsed.expiresOn && new Date(parsed.expiresOn) <= new Date())) {
          auth.instance.loginRedirect(auth.request);
          return;
        }
        accessToken = parsed.accessToken;
      } else {
        const result = await auth.instance.acquireTokenSilent({
          ...auth.request,
          account: auth.account,
        });
        accessToken = result.accessToken;
      }

      // ID token claims — used only as last-resort fallback for name display.
      // GetCurrentUser (Dataverse) is the authoritative source.
      const idClaims = (auth.account.idTokenClaims ?? {}) as Record<string, any>;
      const nameFromIdToken =
        [idClaims["given_name"], idClaims["family_name"]].filter(Boolean).join(" ") ||
        idClaims["name"] ||
        auth.account.name ||                              // MSAL account display name
        auth.account.username?.split("@")[0] || "";       // email prefix as last resort

      const response = await axios.get(
        `${getAppConfig().apiBase}/GetCurrentUser`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      setUserData({
        isTrial:          response.data.isTrial          ?? false,
        isAdmin:          response.data.isAdmin          ?? true,
        tenantName:       response.data.tenantName        ?? "",
        subscriptionTier: response.data.subscriptionTier  ?? "",
        userEmail:        response.data.userEmail          ?? "",
        userName:         response.data.userName           || nameFromIdToken,
        firstName:        response.data.firstName          ?? "",
        lastName:         response.data.lastName           ?? "",
        companyName:      response.data.companyName        ?? "",
        jobTitle:         response.data.jobTitle           ?? "",
        country:          response.data.country            ?? "",
        profileComplete:  response.data.profileComplete    ?? true,
        runsUsed:         response.data.runsUsed           ?? 0,
        runLimit:         response.data.runLimit           ?? 5,
        trialExpiry:      response.data.trialExpiry        ?? "",
        trialExpired:     response.data.trialExpired       ?? false,
        loading: false,
      });
    } catch (err: any) {
      if (err instanceof InteractionRequiredAuthError) {
        // Token refresh required — trigger interactive login
        const auth2 = resolveActiveAuth();
        if (auth2) auth2.instance.loginRedirect(auth2.request);
        return;
      }

      // If the backend says this tenant/account is unknown (500 or 401),
      // the stale MSAL account is unusable — sign it out and go to login.
      const status = err?.response?.status;
      const msg: string = err?.response?.data ?? "";
      const isTenantError =
        status === 500 && msg.toLowerCase().includes("tenant not found");
      const isUnauthorised = status === 401;

      if (isTenantError || isUnauthorised) {
        const auth2 = resolveActiveAuth();
        if (auth2) {
          try {
            await auth2.instance.logoutRedirect({
              account: auth2.account,
              postLogoutRedirectUri: window.location.origin,
            });
          } catch {
            window.location.href = window.location.origin;
          }
        } else {
          window.location.href = window.location.origin;
        }
        return;
      }

      setUserData({ ...defaultData, loading: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Check External ID accounts synchronously — index.tsx processed the redirect
    // before first render, so getAllAccounts() is reliable here.
    const extId = getExternalIdInstance();
    const isExtIdAuthenticated = (extId?.getAllAccounts().length ?? 0) > 0;
    const effectivelyAuthenticated = isAuthenticated || isExtIdAuthenticated;

    if (!effectivelyAuthenticated) {
      setUserData({ ...defaultData, loading: false });
      return;
    }

    fetchCurrentUser();
  }, [isAuthenticated, fetchCurrentUser]);

  return (
    <UserContext.Provider value={{ ...userData, refreshUser: fetchCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
}
