import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import axios from "axios";
import { msalInstance, loginRequest, trialLoginRequest, getExternalIdInstance } from "../authConfig";
import { getAppConfig } from "../appConfig";

interface UserContextType {
  isTrial: boolean;
  userEmail: string;
  userName: string;
  companyName: string;
  tenantName: string;
  subscriptionTier: string;
  loading: boolean;
}

const defaultUser: UserContextType = {
  isTrial: false,
  userEmail: "",
  userName: "",
  companyName: "",
  tenantName: "",
  subscriptionTier: "",
  loading: true,
};

const UserContext = createContext<UserContextType>(defaultUser);

export function useUser(): UserContextType {
  return useContext(UserContext);
}

/**
 * Resolves the active MSAL account and instance.
 * Prefers the main Azure AD instance; falls back to External ID for trial users.
 * Mirrors the same logic in configApi.ts so both always use the same token.
 */
function resolveActiveAuth() {
  const mainAccount = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
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
  const [user, setUser] = useState<UserContextType>(defaultUser);

  useEffect(() => {
    // Check External ID accounts synchronously — index.tsx processed the redirect
    // before first render, so getAllAccounts() is reliable here.
    const extId = getExternalIdInstance();
    const isExtIdAuthenticated = (extId?.getAllAccounts().length ?? 0) > 0;
    const effectivelyAuthenticated = isAuthenticated || isExtIdAuthenticated;

    if (!effectivelyAuthenticated) {
      setUser({ ...defaultUser, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchCurrentUser() {
      try {
        const auth = resolveActiveAuth();
        if (!auth) {
          setUser({ ...defaultUser, loading: false });
          return;
        }

        const result = await auth.instance.acquireTokenSilent({
          ...auth.request,
          account: auth.account,
        });

        const response = await axios.get(
          `${getAppConfig().apiBase}/api/GetCurrentUser`,
          { headers: { Authorization: `Bearer ${result.accessToken}` } }
        );

        if (!cancelled) {
          setUser({
            isTrial:          response.data.isTrial          ?? false,
            tenantName:       response.data.tenantName        ?? "",
            subscriptionTier: response.data.subscriptionTier  ?? "",
            userEmail:        response.data.userEmail          ?? "",
            userName:         response.data.userName           ?? "",
            companyName:      response.data.companyName        ?? "",
            loading: false,
          });
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          // Token refresh required — auth flow will handle it
        }
        if (!cancelled) setUser({ ...defaultUser, loading: false });
      }
    }

    fetchCurrentUser();
    return () => { cancelled = true; };
  }, [isAuthenticated]); // External ID accounts are stable after bootstrap; re-run on Azure AD auth changes

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
