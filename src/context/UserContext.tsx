import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import axios from "axios";
import { msalInstance, loginRequest } from "../authConfig";
import { InteractionRequiredAuthError } from "@azure/msal-browser";

interface UserContextType {
  isTrial: boolean;
  userEmail: string;
  userName: string;
  tenantName: string;
  subscriptionTier: string;
  loading: boolean;
}

const defaultUser: UserContextType = {
  isTrial: false,
  userEmail: "",
  userName: "",
  tenantName: "",
  subscriptionTier: "",
  loading: true,
};

const UserContext = createContext<UserContextType>(defaultUser);

export function useUser(): UserContextType {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<UserContextType>(defaultUser);

  useEffect(() => {
    if (!isAuthenticated) {
      setUser({ ...defaultUser, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchCurrentUser() {
      try {
        const account =
          msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];

        if (!account) {
          setUser({ ...defaultUser, loading: false });
          return;
        }

        const result = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account,
        });

        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE ?? "http://localhost:7071"}/api/GetCurrentUser`,
          { headers: { Authorization: `Bearer ${result.accessToken}` } }
        );

        if (!cancelled) {
          setUser({
            isTrial:          response.data.isTrial          ?? false,
            tenantName:       response.data.tenantName        ?? "",
            subscriptionTier: response.data.subscriptionTier  ?? "",
            userEmail:        response.data.userEmail          ?? "",
            userName:         response.data.userName           ?? "",
            loading: false,
          });
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          // Token refresh needed — auth flow will handle it; keep loading false
        }
        if (!cancelled) setUser({ ...defaultUser, loading: false });
      }
    }

    fetchCurrentUser();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
