import { Layers, FileSearch, ShieldCheck, BrainCircuit } from "lucide-react";
import "./LoginPage.css";

interface LoginPageProps {
  onLogin: () => void;
  onTrialLogin?: () => void;
  loading?: boolean;
}

export default function LoginPage({ onLogin, onTrialLogin, loading = false }: LoginPageProps) {
  return (
    <div className="login-root">

      {/* ── Left panel — brand / hero ── */}
      <div className="login-hero">
        <div className="login-hero-inner">

          <div className="login-logo">
            <div className="login-logo-icon">
              <Layers size={22} />
            </div>
            <span className="login-logo-name">DocInsight</span>
            <span className="login-logo-badge">AI</span>
          </div>

          <div className="login-hero-body">
            <h1 className="login-hero-title">
              Intelligent document<br />comparison at scale
            </h1>
            <p className="login-hero-subtitle">
              Extract, compare and summarise complex documents in seconds
              using AI — so your team can focus on decisions, not data entry.
            </p>

            <ul className="login-feature-list">
              <li>
                <span className="login-feature-icon"><FileSearch size={16} /></span>
                <span>Side-by-side document comparison with scoring</span>
              </li>
              <li>
                <span className="login-feature-icon"><BrainCircuit size={16} /></span>
                <span>AI-powered insight extraction and executive summaries</span>
              </li>
              <li>
                <span className="login-feature-icon"><ShieldCheck size={16} /></span>
                <span>Risk flagging and configurable compliance rules</span>
              </li>
            </ul>
          </div>

          <div className="login-hero-footer">
            Secure · Multi-tenant · Enterprise-ready
          </div>
        </div>

        {/* Decorative circles */}
        <div className="login-decor login-decor--1" />
        <div className="login-decor login-decor--2" />
      </div>

      {/* ── Right panel — sign-in card ── */}
      <div className="login-panel">
        <div className="login-card">

          <div className="login-card-logo">
            <div className="login-logo-icon login-logo-icon--sm">
              <Layers size={16} />
            </div>
          </div>

          <h2 className="login-card-title">Welcome back</h2>
          <p className="login-card-subtitle">
            Sign in with your Microsoft account to continue
          </p>

          <button
            type="button"
            className="login-ms-btn"
            onClick={onLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <MicrosoftLogo />
                <span>Sign in with Microsoft</span>
              </>
            )}
          </button>

          <p className="login-sso-note">
            Single sign-on via Azure Active Directory.
            <br />Contact your administrator if you need access.
          </p>

          <div className="login-separator">or</div>

          <button
            type="button"
            className="login-trial-btn"
            onClick={onTrialLogin}
            disabled={loading || !onTrialLogin}
          >
            Start free trial
          </button>

          <p className="login-trial-note">
            No Microsoft account required · Any work email
          </p>
        </div>

        <p className="login-panel-footer">
          © {new Date().getFullYear()} DocInsight AI · All rights reserved
        </p>
      </div>

    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
