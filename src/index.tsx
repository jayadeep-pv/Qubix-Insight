import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { loadAppConfig } from "./appConfig";
import { initAuth, msalInstance } from "./authConfig";
import App from "./App";
import { UserProvider } from "./context/UserContext";
import "./App.css";
import "./layout/Layout.css";

async function bootstrap() {
  // 1. Load runtime config from /config.json
  const config = await loadAppConfig();

  // 2. Initialise MSAL with the loaded config
  await initAuth(config);

  // 3. Render the app
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
