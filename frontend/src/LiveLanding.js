import React, { useState, useEffect } from "react";

function useQuery() {
  if (typeof window === "undefined") return new URLSearchParams("");
  return new URLSearchParams(window.location.search);
}

export default function LiveLanding() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const query = useQuery();
  const token = query.get("token") || null;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const liveId = (path || "").split("/").filter(Boolean)[1] || null;

  useEffect(() => {
    // Clear message when token changes
    setMessage(null);
  }, [token]);

  const handleConfirm = async () => {
    if (!token) {
      setMessage("Missing access token in link.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/live/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ageConfirmed: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.error || body.reason || "Could not redeem token");
        setLoading(false);
        return;
      }
      // Redirect to watch page with token for playback
      const usedToken = body.token || token;
      try {
        const target = `/live/watch?token=${encodeURIComponent(usedToken)}`;
        if (typeof window !== "undefined") window.location.href = target;
      } catch (_) {
        setMessage("Access granted. You can now watch the live stream.");
      }
    } catch (e) {
      setMessage("Network error while redeeming token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: "0 auto" }}>
      <h2>Live stream landing</h2>
      <p>Stream: {liveId || "Unknown"}</p>
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            padding: 20,
            borderRadius: 10,
            background: "#fff",
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
          <h3>Age verification</h3>
          <p>Please confirm that you are 18 years old or older to watch this live stream.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button
              onClick={() => handleConfirm()}
              disabled={loading}
              style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
            >
              I am 18+
            </button>
            <button
              onClick={() => setMessage("You must be 18+ to view this content.")}
              disabled={loading}
              style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
            >
              I am under 18
            </button>
          </div>
          {loading && <p style={{ marginTop: 12 }}>Processing…</p>}
          {message && <p style={{ marginTop: 12 }}>{message}</p>}
          {!token && (
            <p style={{ marginTop: 12, color: "#666" }}>
              This private stream requires a token in the link. Ask the streamer to resend the link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
