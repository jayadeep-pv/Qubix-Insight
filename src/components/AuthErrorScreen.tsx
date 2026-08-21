import { AlertTriangle } from "lucide-react";
import type { AuthError } from "../context/UserContext";

const COPY: Record<string, { title: string }> = {
  TENANT_NOT_FOUND:    { title: "Account Not Set Up" },
  TOKEN_INVALID:       { title: "Sign-In Problem" },
  TRIAL_EMAIL_BLOCKED: { title: "Work Email Required" },
  SERVER_ERROR:        { title: "Something Went Wrong" },
};

interface AuthErrorScreenProps {
  error: AuthError;
  onRetry: () => void;
  onLogout: () => void;
}

export default function AuthErrorScreen({ error, onRetry, onLogout }: AuthErrorScreenProps) {
  const { title } = COPY[error.code] ?? COPY.SERVER_ERROR;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f9fafb", padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: "100%", background: "#fff", borderRadius: 14,
        border: "1px solid #e5e7eb", boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        padding: "32px 28px", textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: "#fff8f8",
          border: "1px solid #fecaca", display: "flex", alignItems: "center",
          justifyContent: "center", margin: "0 auto 16px",
        }}>
          <AlertTriangle size={22} color="#ef4444" />
        </div>

        <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>
          {title}
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
          {error.message}
        </p>

        {error.detail && (
          <div style={{
            background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
            padding: "8px 10px", marginBottom: 20, textAlign: "left",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.04em", marginBottom: 3 }}>
              REFERENCE (for support)
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", wordBreak: "break-all" }}>
              {error.detail}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
          <button
            type="button"
            onClick={onRetry}
            className="primary-btn"
            style={{ padding: "9px 20px", fontSize: 13.5 }}
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="primary-btn tbs-back-btn"
            style={{ padding: "9px 20px", fontSize: 13.5 }}
          >
            Sign Out
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
          Need help? Contact{" "}
          <a href="mailto:support@qubixinsight.com" style={{ color: "#F97316", textDecoration: "none", fontWeight: 500 }}>
            support@qubixinsight.com
          </a>
        </p>
      </div>
    </div>
  );
}
