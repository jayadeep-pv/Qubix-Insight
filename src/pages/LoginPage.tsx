import { Layers } from "lucide-react";
import { Link } from "react-router-dom";
import "./LoginPage.css";

interface LoginPageProps {
  // Kept wired for when SSO tenants exist — deliberately not rendered
  // anywhere on this page yet. No auth/API changes needed to bring it back,
  // just a button somewhere calling this same handler.
  onLogin:        () => void;
  onTrialLogin?:  () => void;
  onTrialSignIn?: () => void;
  loading?:       boolean;
}

export default function LoginPage({ onTrialLogin, onTrialSignIn, loading = false }: LoginPageProps) {
  const showTrial = !!onTrialLogin;

  return (
    <div className="login-root">
      <div className="login-bg" />

      {/* ── Top nav ── */}
      <nav className="login-nav">
        <div className="login-logo">
          <div className="login-logo-icon"><Layers size={18} /></div>
          <span className="login-logo-name">Qubix Insight</span>
        </div>

        <div className="login-nav-actions">
          {/* Wired to nothing yet on purpose — disabled until SSO tenants
              exist, but visible with a hover explanation rather than hidden,
              so it's not a surprise when it's turned on later. */}
          <span className="login-nav-tooltip-wrap">
            <button type="button" className="login-nav-signin login-nav-signin--disabled" disabled>
              Continue with Microsoft
            </button>
            <span className="login-nav-tooltip">Available for provisioned organisations — contact sales to enable SSO</span>
          </span>
          {onTrialSignIn && (
            <button type="button" className="login-nav-signin" onClick={onTrialSignIn} disabled={loading}>
              Sign In
            </button>
          )}
          <a href="mailto:support@qubixinsight.com" className="login-nav-sales">Talk to sales</a>
          {showTrial && (
            <button type="button" className="login-nav-trial" onClick={() => onTrialLogin?.()} disabled={loading}>
              Start Free Trial
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero — text left, layered product preview right ── */}
      <div className="login-hero-content">
        <div className="login-hero-left">
          <p className="login-hero-tagline">AI-POWERED DOCUMENT INTELLIGENCE</p>
          <h1 className="login-hero-heading">
            From a 60-page contract to a decision in four minutes.
          </h1>
          <p className="login-hero-sub">
            Extract the clauses that matter, compare agreements side by side,
            and score them against your own weighted criteria.
          </p>

          <div className="login-hero-ctas">
            {showTrial && (
              <button type="button" className="login-cta-primary" onClick={() => onTrialLogin?.()} disabled={loading}>
                Start Free Trial →
              </button>
            )}
            <a href="mailto:support@qubixinsight.com" className="login-cta-secondary">Talk to sales</a>
          </div>
          {showTrial && (
            <p className="login-hero-perk">30 days free · No credit card · Any work email</p>
          )}

          <p className="login-hero-footer">
            SOC 2 Type II · Multi-tenant · SSO and SCIM · UK and EU data residency
          </p>
        </div>

        <div className="login-hero-right">
          {/* The real product preview — an actual image, not a hand-built
              CSS recreation, so it's guaranteed pixel-accurate. */}
          <img
            src="/login-demo-preview.png"
            alt="Qubix Insight extracting attributes and risk findings from a services agreement"
            className="login-demo-image"
          />
        </div>
      </div>

      <p className="login-page-footer">
        © {new Date().getFullYear()} Qubix Insight · All rights reserved
        <span className="login-page-footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/security">Security</Link>
        </span>
      </p>
    </div>
  );
}
