import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { loadAppConfig } from "./appConfig";
import { initAuth, initExternalIdAuth, getExternalIdInstance, msalInstance } from "./authConfig";
import App from "./App";
import { UserProvider } from "./context/UserContext";
import "./App.css";
import "./layout/Layout.css";

async function bootstrap() {
  // 1. Load runtime config from /config.json
  const config = await loadAppConfig();

  // 2. Initialise main Azure AD MSAL instance
  await initAuth(config);

  // 3. Initialise External ID MSAL instance (no-op if externalIdClientId is empty)
  await initExternalIdAuth(config);

  // 4. Process any pending External ID redirect BEFORE first render so that
  //    getAllAccounts() is reliable synchronously when components mount.
  const extId = getExternalIdInstance();
  if (extId) {
    try {
      const result = await extId.handleRedirectPromise();
      if (result?.account) extId.setActiveAccount(result.account);
    } catch (err) {
      console.error("[ExtID] Redirect processing failed:", err);
    }
  }

  // 5. Render the app
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
  );

  root.render(
    <BrowserRouter>
      <MsalProvider instance={msalInstance as any}>
        <UserProvider>
          <App />
        </UserProvider>
      </MsalProvider>
    </BrowserRouter>
  );
}

bootstrap();
