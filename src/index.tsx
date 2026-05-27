import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./authConfig";
import App from "./App";
import { UserProvider } from "./context/UserContext";
import "./App.css";
import "./layout/Layout.css";

async function bootstrap() {
  // 🔥 REQUIRED for msal-browser v3+
  await msalInstance.initialize();

  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
  );

  root.render(
    <BrowserRouter>
      <MsalProvider instance={msalInstance}>
        <UserProvider>
          <App />
        </UserProvider>
      </MsalProvider>
    </BrowserRouter>
  );
}

bootstrap();