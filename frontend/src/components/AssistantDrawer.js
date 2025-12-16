import React, { useState } from "react";
import toast from "react-hot-toast";

// Minimal Assistant Drawer - scaffold
export default function AssistantDrawer({ user, platformSummary }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState(null);

  const send = async () => {
    if (!query || query.trim().length === 0) {
      toast.error("Please enter a question");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: query,
          context: { user: { id: user?.id || user?.uid || null }, platformSummary },
        }),
      });
      const j = await res.json();
      if (j && j.reply) setReply(j.reply);
      else setReply("No response");
    } catch (e) {
      console.warn(e);
      toast.error("Assistant request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 1200 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: "#111827",
            color: "#fff",
            borderRadius: 8,
            padding: "10px 14px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {open ? "Close Assistant" : "Assistant"}
        </button>
      </div>
      {open && (
        <div
          style={{
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            background: "#0b1220",
            color: "#fff",
            borderRadius: 8,
            padding: 12,
            marginTop: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Assistant</div>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#d1d5db" }}>
            Ask me about uploads, connections, scheduling, or community moderation.
          </div>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Describe your issue or question"
            style={{
              width: "100%",
              minHeight: 80,
              borderRadius: 6,
              padding: 8,
              border: "1px solid #222",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={send}
              disabled={loading}
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#06b6d4",
                color: "#042331",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {loading ? "Thinking..." : "Ask"}
            </button>
            <button
              onClick={() => {
                setQuery("");
                setReply(null);
              }}
              style={{
                padding: "8px 10px",
                background: "#111827",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
              }}
            >
              Clear
            </button>
          </div>
          {reply && (
            <div
              style={{
                marginTop: 12,
                background: "#071127",
                padding: 10,
                borderRadius: 6,
                color: "#e6eef6",
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Response</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{reply}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
