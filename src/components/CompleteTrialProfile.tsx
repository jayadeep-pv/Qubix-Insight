import { useState } from "react";
import { Layers } from "lucide-react";
import { useUser } from "../context/UserContext";
import { configApi } from "../services/configApi";

/**
 * One-time interstitial shown after a trial user has authenticated but before
 * they've supplied Company/Job Title — the "profile" half of the
 * auth-first-then-profile signup flow. Name/email are already known from the
 * token, so this only asks for the two fields GetCurrentUser's
 * `profileComplete` check actually requires.
 */
export default function CompleteTrialProfile() {
  const { firstName, lastName, userName, userEmail, refreshUser } = useUser();
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || userName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await configApi.updateTrialProfile({ companyName: companyName.trim(), jobTitle: jobTitle.trim() });
      refreshUser();
    } catch (err) {
      console.error("Failed to save profile", err);
      setError("Something went wrong saving your profile. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f9fafb", padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: "100%", background: "#fff", borderRadius: 14,
        border: "1px solid #e5e7eb", boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        padding: "32px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, var(--brand-orange, #C9441B), var(--brand-orange-dark, #A8350F))",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Layers size={18} color="#fff" />
          </div>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 800, color: "#111827" }}>
            Qubix Insight
          </span>
        </div>

        <h1 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700, color: "#111827" }}>
          Complete your profile
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "#6b7280", lineHeight: 1.55 }}>
          Just a couple more details before you get started, {displayName || "there"}.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
              Name
            </label>
            <div style={{
              padding: "9px 12px", borderRadius: 9, border: "1px solid #e5e7eb",
              background: "#f9fafb", fontSize: 13.5, color: "#6b7280",
            }}>
              {displayName || "—"} {userEmail && <span style={{ color: "#9ca3af" }}>· {userEmail}</span>}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
              Company Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => { setCompanyName(e.target.value); if (error) setError(""); }}
              placeholder="Acme Ltd"
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9,
                border: `1px solid ${error ? "#fca5a5" : "#e5e7eb"}`, fontSize: 13.5,
              }}
            />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
              Job Title <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Legal Counsel"
              style={{
                width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9,
                border: "1px solid #e5e7eb", fontSize: 13.5,
              }}
            />
          </div>

          {error && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#dc2626" }}>{error}</p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: "100%", justifyContent: "center", marginTop: 18, height: 42 }}
          >
            {submitting ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
