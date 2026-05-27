import { useEffect, type ReactNode } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "./context/UserContext";
import Layout from "./layout/Layout";
import StartReview from "./pages/StartReview";
import ComparisonResults from "./pages/ComparisonResults";
import { InteractionStatus } from "@azure/msal-browser";
import LoginPage from "./pages/LoginPage";
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

function TrialGuard({ children }: { children: ReactNode }) {
  const { isTrial, loading } = useUser();
  if (loading) return null;
  if (isTrial) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  /* =======================================================
     ENSURE ACTIVE ACCOUNT IS SET (ONCE)
  ======================================================= */
  useEffect(() => {
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  /* =======================================================
     LOGIN / LOGOUT
  ======================================================= */
  const handleLogin = async () => {
    await instance.loginRedirect(loginRequest);
  };

  const handleLogout = async () => {
    await instance.logoutRedirect();
  };

  /* =======================================================
     WAIT FOR MSAL TO FINISH REDIRECT HANDLING
  ======================================================= */
  if (inProgress !== InteractionStatus.None) {
    return <LoginPage onLogin={handleLogin} loading />;
  }

  /* =======================================================
     NOT AUTHENTICATED VIEW
  ======================================================= */
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  /* =======================================================
     AUTHENTICATED ROUTES
  ======================================================= */
  return (
    <Routes>
      <Route path="/" element={<Layout onLogout={handleLogout} />}>

        {/* Default landing page */}
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />

        {/* Start a new comparison */}
        <Route path="new" element={<StartReview />} />

        {/* New insight flows — all use StartReview with location state for mode pre-selection */}
        <Route path="new/compare" element={<StartReview />} />
        <Route path="new/scored" element={<StartReview />} />
        <Route path="new/summarise" element={<StartReview />} />

        {/* Comparisons list */}
        <Route path="comparisons" element={<Comparisons />} />

        {/* Comparison results */}
        <Route path="results/:runId" element={<ComparisonResults />} />

        {/* ===============================
            CONFIGURATION SCREENS
        =============================== */}

        <Route path="document-types" element={<TrialGuard><DocumentTypes /></TrialGuard>} />
        <Route path="document-types/new" element={<TrialGuard><DocumentTypeForm /></TrialGuard>} />
        <Route path="document-types/:id" element={<TrialGuard><DocumentTypeForm /></TrialGuard>} />

        <Route path="/comparison-templates" element={<TrialGuard><ComparisonTemplate /></TrialGuard>} />
        <Route path="/comparison/new" element={<TrialGuard><ComparisonTemplateForm /></TrialGuard>} />
        <Route path="/comparison/:id" element={<TrialGuard><ComparisonTemplateForm /></TrialGuard>} />

        <Route path="/admin/template-attributes" element={<TrialGuard><TemplateAttributes /></TrialGuard>} />
        <Route path="/admin/template-attributes/new" element={<TrialGuard><TemplateAttributeForm /></TrialGuard>} />
        <Route path="/admin/template-attributes/:id" element={<TrialGuard><TemplateAttributeForm /></TrialGuard>} />

        <Route path="/admin/rules" element={<TrialGuard><RulesList /></TrialGuard>} />
        <Route path="/admin/rules/new" element={<TrialGuard><RuleForm /></TrialGuard>} />
        <Route path="/admin/rules/:id" element={<TrialGuard><RuleForm /></TrialGuard>} />

        <Route path="/admin/ai-insight-profiles" element={<TrialGuard><AiInsightProfiles /></TrialGuard>} />
        <Route path="/admin/ai-insight-profiles/new" element={<TrialGuard><AiInsightProfileForm /></TrialGuard>} />
        <Route path="/admin/ai-insight-profiles/:id" element={<TrialGuard><AiInsightProfileForm /></TrialGuard>} />

        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-insights" element={<MyInsights />} />
        <Route path="/all-insights" element={<TrialGuard><AllInsights /></TrialGuard>} />

        <Route path="/runs/:runId" element={<RunResults />} />

        <Route path="/settings" element={<TrialGuard><TenantSettings /></TrialGuard>} />

        <Route path="/support" element={<SupportPage />} />

      </Route>
    </Routes>
  );
}

export default App;