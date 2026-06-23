import React, { useState, useEffect, type ReactNode } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest, trialLoginRequest, getExternalIdInstance } from "./authConfig";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useUser } from "./context/UserContext";
import Layout from "./layout/Layout";
import StartReview from "./pages/StartReview";
import ComparisonResults from "./pages/ComparisonResults";
import LoginPage, { type TrialProfileData } from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import Comparisons from "./pages/Comparisons";
import DocumentTypes from "./pages/DocumentTypes";
import DocumentTypeForm from "./pages/DocumentTypeForm";
import "./styles/admin.css";
import ComparisonTemplate from "./pages/ComparisonTemplate";
import ComparisonTemplateForm from "./pages/ComparisonTemplateForm";
import TemplateAttributes from "./pages/TemplateAttributes";
import TemplateAttributeForm from "./pages/TemplateAttributeForm"
import RulesList from "./pages/RulesList";
import RuleForm from "./pages/RuleForm";
import AiInsightProfiles from "./pages/AiInsightProfiles"
import AiInsightProfileForm from "./pages/AiInsightProfileForm"
import RunResults from "./pages/RunResults";
import MyInsights from "./pages/MyInsights";
import AllInsights from "./pages/AllInsights";
import HomePage from "./pages/HomePage";
import TenantSettings from "./pages/TenantSettings";
import SupportPage from "./pages/SupportPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // The main scroll container is .content (overflow:auto), not the window
    const el = document.querySelector(".content") as HTMLElement | null;
    if (el) el.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function TrialGuard({ children }: { children: ReactNode }) {
  const { isTrial, loading } = useUser();
  if (loading) return null;
  if (isTrial) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

// Redirects workflow-only pages back to home when landed via post-login redirect
// (no navigation state = MSAL returned here after re-auth, not a deliberate click).
function PostLoginGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const WORKFLOW_PATHS = ["/new", "/new/compare", "/new/scored", "/new/summarise"];
  if (WORKFLOW_PATHS.includes(location.pathname) && !location.state) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}


function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // External ID auth: initialised synchronously from accounts already in localStorage
  // (index.tsx called handleRedirectPromise() before first render, so this is reliable).
  const [extIdAuthenticated, setExtIdAuthenticated] = useState(() => {
    const extId = getExternalIdInstance();
    return (extId?.getAllAccounts().length ?? 0) > 0;
  });

  /* =======================================================
     SET ACTIVE ACCOUNTS
  ======================================================= */
  useEffect(() => {
    // Main Azure AD instance
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  useEffect(() => {
    // External ID instance — ensure active account is set after any redirect
    const extId = getExternalIdInstance();
    if (!extId) return;
    const extAccounts = extId.getAllAccounts();
    if (extAccounts.length > 0) {
      if (!extId.getActiveAccount()) extId.setActiveAccount(extAccounts[0]);
      setExtIdAuthenticated(true);
    }
  }, []);

  /* =======================================================
     LOGIN / LOGOUT
  ======================================================= */
  const handleLogin = async () => {
    await instance.loginRedirect(loginRequest);
  };

  const handleTrialLogin = async (profile: TrialProfileData) => {
    sessionStorage.setItem("trial_signup_profile", JSON.stringify(profile));
    const extId = getExternalIdInstance();
    if (extId) await extId.loginRedirect({
      ...trialLoginRequest,
      prompt: "create",
      loginHint: profile.email,
    });
  };

  const handleTrialSignIn = async () => {
    const extId = getExternalIdInstance();
    if (extId) await extId.loginRedirect(trialLoginRequest);
  };

  const handleLogout = async () => {
    const extId = getExternalIdInstance();
    // Only treat as External ID session when the account actually came from ciamlogin.com.
    // Without this filter getAllAccounts() can return stale Azure AD accounts from
    // localStorage and the wrong MSAL instance attempts logout → authority_mismatch.
    const extAccounts = extId
      ? extId.getAllAccounts().filter(a => a.environment?.includes("ciamlogin.com"))
      : [];

    try {
      if (extId && extAccounts.length > 0) {
        setExtIdAuthenticated(false);
        const extAccount = extId.getActiveAccount() ?? extAccounts[0];
        await extId.logoutRedirect({
          account: extAccount,
          logoutHint: extAccount.username,
          postLogoutRedirectUri: window.location.origin,
        });
      } else {
        const mainAccount = instance.getActiveAccount() ?? accounts[0];
        await instance.logoutRedirect({
          account: mainAccount ?? undefined,
          postLogoutRedirectUri: window.location.origin,
        });
      }
    } catch (err) {
      // Fallback: clear MSAL cache and reload to the login page.
      // Handles authority_mismatch or other redirect errors (e.g. localhost dev).
      console.warn("[Auth] logoutRedirect failed, clearing cache:", err);
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = window.location.origin;
    }
  };

  /* =======================================================
     COMBINED AUTH STATE
  ======================================================= */
  const effectivelyAuthenticated = isAuthenticated || extIdAuthenticated;

  // Show loading spinner while main MSAL is processing a redirect.
  // External ID redirect is already resolved before first render (see index.tsx).
  if (inProgress !== InteractionStatus.None) {
    return <LoginPage onLogin={handleLogin} loading />;
  }

  /* =======================================================
     NOT AUTHENTICATED VIEW
  ======================================================= */
  if (!effectivelyAuthenticated) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onTrialLogin={getExternalIdInstance() ? handleTrialLogin : undefined}
        onTrialSignIn={getExternalIdInstance() ? handleTrialSignIn : undefined}
        loading={inProgress !== InteractionStatus.None}
      />
    );
  }

  /* =======================================================
     AUTHENTICATED ROUTES
  ======================================================= */
  return (
    <React.Fragment>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} />}>

        {/* Default landing page */}
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />

        {/* Start a new comparison — guarded so post-login redirect goes to home */}
        <Route path="new" element={<PostLoginGuard><StartReview /></PostLoginGuard>} />
        <Route path="new/compare" element={<PostLoginGuard><StartReview /></PostLoginGuard>} />
        <Route path="new/scored" element={<PostLoginGuard><StartReview /></PostLoginGuard>} />
        <Route path="new/summarise" element={<PostLoginGuard><StartReview /></PostLoginGuard>} />

        {/* Comparisons list */}
        <Route path="comparisons" element={<Comparisons />} />

        {/* Comparison results */}
        <Route path="results/:runId" element={<ComparisonResults />} />

        {/* ===============================
            CONFIGURATION SCREENS
        =============================== */}

        {/* List pages and forms — access controlled via isAdmin UI states */}
        <Route path="document-types" element={<DocumentTypes />} />
        <Route path="document-types/new" element={<DocumentTypeForm />} />
        <Route path="document-types/:id" element={<DocumentTypeForm />} />

        <Route path="/comparison-templates" element={<ComparisonTemplate />} />
        <Route path="/comparison/new" element={<ComparisonTemplateForm />} />
        <Route path="/comparison/:id" element={<ComparisonTemplateForm />} />

        <Route path="/admin/template-attributes" element={<TemplateAttributes />} />
        <Route path="/admin/template-attributes/new" element={<TemplateAttributeForm />} />
        <Route path="/admin/template-attributes/:id" element={<TemplateAttributeForm />} />

        <Route path="/admin/rules" element={<RulesList />} />
        <Route path="/admin/rules/new" element={<RuleForm />} />
        <Route path="/admin/rules/:id" element={<RuleForm />} />

        <Route path="/admin/ai-insight-profiles" element={<AiInsightProfiles />} />
        <Route path="/admin/ai-insight-profiles/new" element={<AiInsightProfileForm />} />
        <Route path="/admin/ai-insight-profiles/:id" element={<AiInsightProfileForm />} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-insights" element={<MyInsights />} />
        <Route path="/all-insights" element={<AllInsights />} />

        <Route path="/runs/:runId" element={<RunResults />} />

        {/* Settings — trial users cannot access */}
        <Route path="/settings" element={<TrialGuard><TenantSettings /></TrialGuard>} />

        <Route path="/support" element={<SupportPage />} />

      </Route>
      </Routes>
    </React.Fragment>
  );
}

export default App;
