import React from "react";

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

export default function ChatTab({
  chatMessages,
  chatInput,
  setChatInput,
  sendChatQuestion,
  chatLoading
}: Props) {
  return (
    <div
      className="results-card"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: "60vh"
      }}
    >
      {/* TITLE */}
      <div style={{ fontWeight: 600, fontSize: 16 }}>
        AI Q&A
      </div>

      {/* INPUT */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 10,
          background: "#ffffff"
        }}
      >
        <input
          title="Ask a question"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask a question..."
          onKeyDown={(e) => e.key === "Enter" && sendChatQuestion()}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            outline: "none"
          }}
        />

        <button
          onClick={sendChatQuestion}
          style={{
            padding: "10px 18px",
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Send
        </button>
      </div>

      {/* CHAT BODY */}
      <div
        style={{
          flex: 1,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#f9fafb",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto"
        }}
      >
        {chatMessages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent:
                m.role === "user" ? "flex-end" : "flex-start"
            }}
          >
            <div
              style={{
                background: m.role === "user" ? "#2563eb" : "#ffffff",
                color: m.role === "user" ? "#ffffff" : "#111827",
                padding: "10px 14px",
                borderRadius: 12,
                maxWidth: "60%",
                fontSize: 14,
                lineHeight: 1.4,
                border:
                  m.role === "ai" ? "1px solid #e5e7eb" : "none"
              }}
            >
              {m.role === "user" ? (
                m.text
              ) : (
                (() => {
                  try {
                    const parsed =
                      typeof m.text === "string"
                        ? JSON.parse(m.text)
                        : m.text;

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {Object.entries(parsed).map(([key, value]) => (
                          <div key={key}>
                            <strong>
                              {key
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, function (l) {
                                  return l.toUpperCase();
                                })}
                              :
                            </strong>{" "}
                            {String(value)}
                          </div>
                        ))}
                      </div>
                    );
                  } catch {
                    return m.text;
                  }
                })()
              )}
            </div>
          </div>
        ))}

        {chatLoading && (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            Thinking...
          </div>
        )}
      </div>
    </div>
  );
}