import { useState } from "react";
import { Layers, ArrowLeft } from "lucide-react";
import "./LoginPage.css";

export interface TrialProfileData {
  firstName:   string;
  lastName:    string;
  email:       string;
  companyName: string;
  jobTitle:    string;
  country:     string;
}

interface LoginPageProps {
  onLogin:        () => void;
  onTrialLogin?:  (profile: TrialProfileData) => void;
  onTrialSignIn?: () => void;
  loading?:       boolean;
}

type Field = keyof TrialProfileData;

export default function LoginPage({ onLogin, onTrialLogin, onTrialSignIn, loading = false }: LoginPageProps) {
  const [showForm,   setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form,       setForm]       = useState<TrialProfileData>(
    { firstName: "", lastName: "", email: "", companyName: "", jobTitle: "", country: "" }
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors(err => ({ ...err, [key]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<Field, string>> = {};
    if (!form.firstName.trim())   e.firstName   = "Required";
    if (!form.lastName.trim())    e.lastName    = "Required";
    if (!form.email.trim())       e.email       = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(form.email) || /\.\./.test(form.email))
      e.email = "Enter a valid work email";
    if (!form.companyName.trim()) e.companyName = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStartTrial = () => {
    if (!validate()) return;
    setSubmitting(true);
    onTrialLogin?.(form);
  };

  return (
    <div className="login-root">

      {/* ── Left panel — form (white) ── */}
      <div className={`login-panel${showForm ? " login-panel--wide" : ""}`}>

        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon"><Layers size={22} /></div>
          <div className="login-logo-text">
            <span className="login-logo-name">Qubix Insight</span>
            <span className="login-logo-sub">iLogix Global</span>
          </div>
        </div>

        {!showForm ? (

          /* ── Sign-in card ── */
          <div>
            <h2 className="login-card-title">Sign in</h2>
            <p className="login-card-subtitle">
              Use your Microsoft account to access your workspace
            </p>

            <button type="button" className="login-ms-btn" onClick={onLogin} disabled={loading}>
              {loading
                ? (<><span className="login-spinner" /><span>Signing in…</span></>)
                : (<><MicrosoftLogo /><span>Sign in with Microsoft</span></>)
              }
            </button>

            <p className="login-sso-note">
              Single sign-on via Azure Active Directory.<br />
              Contact your administrator if you need access.
            </p>

            {onTrialLogin && (
              <>
                <div className="login-separator">or</div>

                <div className="login-trial-teaser">
                  <p className="login-trial-teaser-title">New to Qubix Insight?</p>
                  <p className="login-trial-teaser-sub">
                    30 days free · No credit card · Any work email
                  </p>
                  <button
                    type="button"
                    className="login-trial-btn"
                    onClick={() => setShowForm(true)}
                    disabled={loading}
                  >
                    Register for free trial
                  </button>
                  <button
                    type="button"
                    className="login-trial-signin"
                    onClick={() => onTrialSignIn?.()}
                    disabled={loading}
                  >
                    Already registered? <strong>Sign in to trial</strong>
                  </button>
                </div>
              </>
            )}
          </div>

        ) : (

          /* ── Trial registration form ── */
          <div className="login-card--form">
            <h2 className="login-card-title">Start your free trial</h2>
            <p className="login-card-subtitle">30 days free · No credit card required</p>

            <div className="lf-row">
              <div className="lf-field">
                <label className="lf-label">First Name <span className="lf-req">*</span></label>
                <input
                  className={`lf-input${errors.firstName ? " lf-input--err" : ""}`}
                  value={form.firstName}
                  onChange={set("firstName")}
                  placeholder="Jane"
                  autoFocus
                />
                {errors.firstName && <span className="lf-err">{errors.firstName}</span>}
              </div>
              <div className="lf-field">
                <label className="lf-label">Last Name <span className="lf-req">*</span></label>
                <input
                  className={`lf-input${errors.lastName ? " lf-input--err" : ""}`}
                  value={form.lastName}
                  onChange={set("lastName")}
                  placeholder="Smith"
                />
                {errors.lastName && <span className="lf-err">{errors.lastName}</span>}
              </div>
            </div>

            <div className="lf-field lf-field--full">
              <label className="lf-label">Work Email <span className="lf-req">*</span></label>
              <input
                className={`lf-input${errors.email ? " lf-input--err" : ""}`}
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="jane@company.com"
              />
              {errors.email && <span className="lf-err">{errors.email}</span>}
            </div>

            <div className="lf-field lf-field--full">
              <label className="lf-label">Company Name <span className="lf-req">*</span></label>
              <input
                className={`lf-input${errors.companyName ? " lf-input--err" : ""}`}
                value={form.companyName}
                onChange={set("companyName")}
                placeholder="Acme Ltd"
              />
              {errors.companyName && <span className="lf-err">{errors.companyName}</span>}
            </div>

            <div className="lf-row">
              <div className="lf-field">
                <label className="lf-label">Job Title</label>
                <input
                  className="lf-input"
                  value={form.jobTitle}
                  onChange={set("jobTitle")}
                  placeholder="e.g. Legal Counsel"
                />
              </div>
              <div className="lf-field">
                <label className="lf-label">Country</label>
                <input
                  className="lf-input"
                  value={form.country}
                  onChange={set("country")}
                  placeholder="e.g. United Kingdom"
                />
              </div>
            </div>

            <button
              type="button"
              className="login-ms-btn login-ms-btn--primary"
              onClick={handleStartTrial}
              disabled={submitting}
            >
              {submitting
                ? (<><span className="login-spinner" /><span>Redirecting…</span></>)
                : <span>Continue to email verification →</span>
              }
            </button>

            <button type="button" className="lf-back" onClick={() => setShowForm(false)}>
              <ArrowLeft size={13} />
              Back to sign in
            </button>
          </div>
        )}

        <p className="login-panel-footer">
          © {new Date().getFullYear()} Qubix Insight · All rights reserved
        </p>
      </div>

      {/* ── Right panel — feature network ── */}
      <div className="login-hero">
        <p className="login-hero-tagline">Document intelligence, connected</p>
        <FeatureNetwork />
        <p className="login-hero-footer">Secure · Multi-tenant · Enterprise-ready</p>
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

function FeatureNetwork() {
  const cx = 280, cy = 250;
  const R  = 152;

  // 6 satellite nodes at 60° intervals starting from top
  const nodes = [
    { angle: 270, label: "AI Insights",      sub: "Smart extraction",   color: "#a78bfa" },
    { angle: 330, label: "Compare",          sub: "Side-by-side",       color: "#60a5fa" },
    { angle:  30, label: "Scoring",          sub: "Ranked results",     color: "#fbbf24" },
    { angle:  90, label: "Summarise",        sub: "Key highlights",     color: "#34d399" },
    { angle: 150, label: "Quick Scan",       sub: "Instant analysis",   color: "#818cf8" },
    { angle: 210, label: "Risk Analysis",    sub: "Flag & comply",      color: "#f87171" },
  ].map(n => {
    const rad = (n.angle * Math.PI) / 180;
    return { ...n, x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  });

  return (
    <svg viewBox="0 0 560 500" className="login-network-svg" aria-hidden="true">
      <defs>
        {/* subtle glow filter for center node */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Ring connections between adjacent nodes ── */}
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        return (
          <line key={`ring-${i}`}
            x1={n.x} y1={n.y} x2={next.x} y2={next.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        );
      })}

      {/* ── Spoke lines from center to each node ── */}
      {nodes.map((n, i) => (
        <line key={`spoke-${i}`}
          x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke="rgba(255,255,255,0.1)" strokeWidth="1"
          strokeDasharray="4 4" />
      ))}

      {/* ── Satellite nodes ── */}
      {nodes.map((n, i) => (
        <g key={i} transform={`translate(${n.x},${n.y})`}>
          {/* outer glow ring */}
          <circle r="40" fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.2" />
          {/* filled circle */}
          <circle r="34" fill={n.color} fillOpacity="0.1" stroke={n.color} strokeWidth="1.2" strokeOpacity="0.5" />
          {/* label */}
          <text y="-6" textAnchor="middle"
            fill="white" fontSize="10.5" fontWeight="600"
            fontFamily="'DM Sans', sans-serif" opacity="0.92">
            {n.label}
          </text>
          <text y="9" textAnchor="middle"
            fill={n.color} fontSize="9" fontWeight="500"
            fontFamily="'DM Sans', sans-serif" opacity="0.75">
            {n.sub}
          </text>
          {/* dot in center */}
          <circle r="3.5" fill={n.color} fillOpacity="0.7" />
        </g>
      ))}

      {/* ── Centre node ── */}
      <g transform={`translate(${cx},${cy})`} filter="url(#glow)">
        <circle r="56" fill="rgba(250,70,22,0.08)" stroke="rgba(250,70,22,0.3)" strokeWidth="1.5" />
        <circle r="42" fill="rgba(250,70,22,0.15)" stroke="#FA4616" strokeWidth="1.5" strokeOpacity="0.6" />
        {/* Layers icon paths drawn manually */}
        <polygon points="0,-10 10,-5 0,0 -10,-5" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points="-10,-1 0,4 10,-1" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points="-10,3 0,8 10,3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
        <text y="24" textAnchor="middle"
          fill="white" fontSize="11" fontWeight="700"
          fontFamily="'Syne', sans-serif" letterSpacing="-0.3" opacity="0.9">
          Qubix Insight
        </text>
      </g>
    </svg>
  );
}
