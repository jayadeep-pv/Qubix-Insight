import React, { useEffect, useRef } from "react";
import { Send, BotMessageSquare } from "lucide-react";

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
  suggestedPrompts?: string[];
}

const DEFAULT_SUGGESTED = [
  "Summarise this document",
  "Who are the parties involved?",
  "What are the key dates or deadlines?",
  "What are the main points or conclusions?",
];

function renderValue(value: unknown): React.ReactNode {
  // Already a JS array
  if (Array.isArray(value) && value.length > 0) {
    return (
      <ul style={{ margin: "4px 0 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {value.map((item, i) => (
          <li key={i} style={{ fontSize: 11, lineHeight: 1.5 }}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  // String that looks like a JSON array — try parsing it
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return (
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {parsed.map((item: unknown, i: number) => (
                <li key={i} style={{ fontSize: 11, lineHeight: 1.5 }}>{String(item)}</li>
              ))}
            </ul>
          );
        }
      } catch {}
    }
  }
  return <span>{String(value)}</span>;
}

function AiMessageContent({ text }: { text: string }) {
  try {
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return (
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
          {parsed.map((item, i) => (
            <li key={i} style={{ fontSize: 11, lineHeight: 1.5 }}>{String(item)}</li>
          ))}
        </ul>
      );
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(parsed).map(([key, value]) => (
            <div key={key} style={{ fontSize: 11, lineHeight: 1.4 }}>
              <strong style={{ textTransform: "capitalize" }}>
                {key.replace(/_/g, " ")}:
              </strong>{" "}
              {renderValue(value)}
            </div>
          ))}
        </div>
      );
    }
  } catch {}
  return <span>{text}</span>;
}

function BotAvatar({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: "linear-gradient(135deg, #FA4616 0%, #c7340f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      boxShadow: "0 2px 8px rgba(250,70,22,0.3)",
    }}>
      <BotMessageSquare size={size * 0.5} color="#fff" />
    </div>
  );
}

export default function ChatTab({
  chatMessages,
  chatInput,
  setChatInput,
  sendChatQuestion,
  chatLoading,
  suggestedPrompts,
}: Props) {
  const SUGGESTED = (suggestedPrompts && suggestedPrompts.length > 0)
    ? suggestedPrompts
    : DEFAULT_SUGGESTED;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const isEmpty = chatMessages.length === 0 && !chatLoading;

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
        background: "linear-gradient(135deg, #fff7f5 0%, #ffffff 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BotAvatar size={30} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
              Qubix Bot
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              Ask anything about this document
            </div>
          </div>
          <div style={{
            marginLeft: "auto",
            width: 7, height: 7, borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 0 2px #dcfce7",
          }} />
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>

        {/* ── Empty / welcome state ── */}
        {isEmpty && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "8px 4px",
          }}>
            {/* Bot avatar + greeting */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <BotAvatar size={52} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                  Hi, I'm Qubix Bot!
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
                  I've read this document and I'm ready<br />to answer your questions.
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: "100%", height: 1,
              background: "linear-gradient(to right, transparent, #e2e8f0, transparent)",
              margin: "4px 0",
            }} />

            {/* Suggestions label */}
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.06em",
              alignSelf: "flex-start",
            }}>
              Try asking
            </div>

            {/* Suggestion chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => { setChatInput(q); sendChatQuestion(); }}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 11,
                    color: "#334155",
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = "#FA4616";
                    e.currentTarget.style.background = "#fff7f5";
                    e.currentTarget.style.color = "#FA4616";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.color = "#334155";
                  }}
                >
                  <span style={{ color: "#FA4616", flexShrink: 0, fontSize: 13 }}>›</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        {chatMessages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
            gap: 3,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {m.role === "ai" && <BotAvatar size={16} />}
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: m.role === "user" ? "#64748b" : "#FA4616",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {m.role === "user" ? "You" : "Qubix Bot"}
              </span>
            </div>
            <div style={{
              background: m.role === "user" ? "#FA4616" : "#f8fafc",
              color: m.role === "user" ? "#ffffff" : "#1e293b",
              padding: "8px 10px",
              borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
              maxWidth: "92%",
              fontSize: 11,
              lineHeight: 1.55,
              border: m.role === "ai" ? "1px solid #e2e8f0" : "none",
            }}>
              {m.role === "ai" ? <AiMessageContent text={m.text} /> : m.text}
            </div>
          </div>
        ))}

        {/* ── Typing indicator ── */}
        {chatLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <BotAvatar size={16} />
              <span style={{ fontSize: 10, fontWeight: 600, color: "#FA4616",
                textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Qubix Bot
              </span>
            </div>
            <div style={{
              background: "#f8fafc", border: "1px solid #e2e8f0",
              borderRadius: "2px 10px 10px 10px",
              padding: "8px 12px", display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#FA4616",
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
        background: "#fff",
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
            placeholder="Ask Qubix Bot anything…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontSize: 11,
              color: "#0f172a",
              outline: "none",
              fontFamily: "inherit",
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
