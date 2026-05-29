import { useState } from "react";
import { Layers, FileSearch, ShieldCheck, BrainCircuit, ArrowLeft } from "lucide-react";
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
  onLogin:       () => void;
  onTrialLogin?: (profile: TrialProfileData) => void;
  loading?:      boolean;
}

type Field = keyof TrialProfileData;

export default function LoginPage({ onLogin, onTrialLogin, loading = false }: LoginPageProps) {
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [form,        setForm]        = useState<TrialProfileData>(
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
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid work email";
    if (!form.companyName.trim()) e.companyName = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStartTrial = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try { await onTrialLogin?.(form); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="login-root">

      {/* ── Left panel — brand / hero ── */}
      <div className="login-hero">
        <div className="login-hero-inner">

          <div className="login-logo">
            <div className="login-logo-icon"><Layers size={22} /></div>
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

          <div className="login-hero-footer">Secure · Multi-tenant · Enterprise-ready</div>
        </div>
        <div className="login-decor login-decor--1" />
        <div className="login-decor login-decor--2" />
      </div>

      {/* ── Right panel ── */}
      <div className={`login-panel${showForm ? " login-panel--wide" : ""}`}>

        {!showForm ? (

          /* ── Sign-in card ── */
          <div className="login-card">

            <div className="login-card-logo">
              <div className="login-logo-icon login-logo-icon--sm"><Layers size={16} /></div>
            </div>

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
                </div>
              </>
            )}
          </div>

        ) : (

          /* ── Trial registration form ── */
          <div className="login-card login-card--form">

            <div className="login-card-logo">
              <div className="login-logo-icon login-logo-icon--sm"><Layers size={16} /></div>
            </div>

            <h2 className="login-card-title">Start your free trial</h2>
            <p className="login-card-subtitle">
              30 days free · No credit card required
            </p>

            {/* First + Last */}
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

            {/* Work Email */}
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

            {/* Company */}
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

            {/* Job Title + Country */}
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
