import { useEffect, useRef } from "react";
import { Send } from "lucide-react";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

interface Props {
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChatQuestion: () => void;
  chatLoading: boolean;
}

const SUGGESTED = [
  "Who are the tenants?",
  "Is there a break clause?",
  "What are landlord obligations?",
];

function AiMessageContent({ text }: { text: string }) {
  try {
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {Object.entries(parsed).map(([key, value]) => (
            <div key={key} style={{ fontSize: 11, lineHeight: 1.4 }}>
              <strong style={{ textTransform: "capitalize" }}>
                {key.replace(/_/g, " ")}:
              </strong>{" "}
              {String(value)}
            </div>
          ))}
        </div>
      );
    }
  } catch {}
  return <span>{text}</span>;
}

export default function ChatTab({
  chatMessages,
  chatInput,
  setChatInput,
  sendChatQuestion,
  chatLoading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#ffffff",
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: "12px 14px 10px",
        borderBottom: "1px solid #f1f5f9",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: "linear-gradient(135deg,#FA4616,#c7340f)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
              Document AI
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              Stays open across all tabs
            </div>
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>

        {/* empty state with suggestions */}
        {chatMessages.length === 0 && !chatLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              background: "#f8fafc",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 11,
              color: "#334155",
              lineHeight: 1.5,
              border: "1px solid #e2e8f0",
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#FA4616",
                textTransform: "uppercase", letterSpacing: "0.05em",
                display: "block", marginBottom: 4,
              }}>
                Qubix AI
              </span>
              I've read this document. Ask me anything about its terms, parties, or risks.
            </div>

            <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>
              Try asking
            </div>
            {SUGGESTED.map(q => (
              <button
                key={q}
                onClick={() => { setChatInput(q); sendChatQuestion(); }}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 11,
                  color: "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                  lineHeight: 1.4,
                  transition: "border-color 0.15s",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#FA4616")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* messages */}
        {chatMessages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
            gap: 3,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: m.role === "user" ? "#64748b" : "#FA4616",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {m.role === "user" ? "You" : "Qubix AI"}
            </span>
            <div style={{
              background: m.role === "user" ? "#FA4616" : "#f1f5f9",
              color: m.role === "user" ? "#ffffff" : "#1e293b",
              padding: "8px 10px",
              borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              maxWidth: "92%",
              fontSize: 11,
              lineHeight: 1.5,
              border: m.role === "ai" ? "1px solid #e2e8f0" : "none",
            }}>
              {m.role === "ai" ? <AiMessageContent text={m.text} /> : m.text}
            </div>
          </div>
        ))}

        {/* typing indicator */}
        {chatLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#FA4616",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Qubix AI
            </span>
            <div style={{
              background: "#f1f5f9", border: "1px solid #e2e8f0",
              borderRadius: "10px 10px 10px 2px",
              padding: "8px 12px", display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#94a3b8",
                  animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  display: "inline-block",
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{
        padding: "10px",
        borderTop: "1px solid #f1f5f9",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "6px 8px 6px 12px",
          transition: "border-color 0.15s",
        }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatQuestion()}
            placeholder="Ask about this document…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontSize: 11,
              color: "#0f172a",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <button
            onClick={sendChatQuestion}
            disabled={!chatInput.trim() || chatLoading}
            style={{
              width: 28, height: 28,
              borderRadius: 7,
              background: chatInput.trim() ? "#FA4616" : "#e2e8f0",
              border: "none",
              cursor: chatInput.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
          >
            <Send size={13} color={chatInput.trim() ? "#fff" : "#94a3b8"} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes chatDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
