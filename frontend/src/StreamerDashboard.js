import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./StreamerDashboard.css";
// const io = () => ({ on: () => {}, off: () => {}, emit: () => {}, disconnect: () => {} }); // Mock removed
import { useToast } from "./components/ToastProvider";

export default function StreamerDashboard() {
  const [liveId, setLiveId] = useState("mystream");
  const [tokens, setTokens] = useState([]);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();
  const [recentTips, setRecentTips] = useState([]);

  const getAuthToken = () => {
    try {
      if (typeof window !== "undefined" && window.__E2E_TEST_TOKEN) return window.__E2E_TEST_TOKEN;
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u && u.token) return u.token;
      }
    } catch (_) {}
    return null;
  };

  const fetchTokens = async () => {
    try {
      const headers = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/live/${encodeURIComponent(liveId)}/tokens`, {
        method: "GET",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.tokens) setTokens(body.tokens);
    } catch (_) {}
  };

  useEffect(() => {
    fetchTokens();
    // Try Socket.IO first (for streamer realtime), fall back to SSE
    let es;
    let socket;
    const handleTip = data => {
      try {
        setRecentTips(t =>
          [{ amount: data.amount, currency: data.currency, payer: data.payer, time: data.time }]
            .concat(t)
            .slice(0, 10)
        );
        showToast({
          type: "success",
          text: `Tip received ${data.amount || ""} ${data.currency || ""}`,
        });
      } catch (_) {}
    };
    try {
      socket = io(window.location.origin, { transports: ["websocket"], path: "/socket.io" });
      socket.on("connect", () => {
        try {
          socket.emit("joinLive", liveId);
        } catch (_) {}
      });
      socket.on("tip", handleTip);
      socket.on("connect_error", () => {
        // fallback to SSE if socket connection fails
        try {
          es = new EventSource(`/api/payments/tips/stream/${encodeURIComponent(liveId)}`);
          es.onmessage = e => {
            try {
              const data = JSON.parse(e.data);
              if (data && data.type === "tip") handleTip(data);
            } catch (_) {}
          };
        } catch (_) {}
      });
    } catch (e) {
      try {
        es = new EventSource(`/api/payments/tips/stream/${encodeURIComponent(liveId)}`);
        es.onmessage = e => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.type === "tip") handleTip(data);
          } catch (_) {}
        };
      } catch (_) {}
    }
    return () => {
      try {
        socket && socket.disconnect();
      } catch (_) {}
      try {
        es && es.close();
      } catch (_) {}
    };
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    // clear previous toasts handled by provider
    try {
      const headers = { "Content-Type": "application/json" };
      const auth = getAuthToken();
      if (auth) headers.Authorization = `Bearer ${auth}`;
      const res = await fetch(`/api/live/${encodeURIComponent(liveId)}/create-token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ maxUses: 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.token) {
        await fetchTokens();
        navigator.clipboard && clipboardWrite(body.url);
        showToast({
          type: "success",
          text: "Token created — URL copied to clipboard (if available).",
        });
      } else {
        showToast({
          type: "error",
          text: "Failed to create token: " + (body.error || body.reason || "unknown"),
        });
      }
    } catch (e) {
      showToast({ type: "error", text: "Network error while creating token" });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async token => {
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(token)}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchTokens();
        showToast({ type: "success", text: "Token revoked" });
      } else {
        showToast({ type: "error", text: "Failed to revoke token" });
      }
    } catch (_) {}
  };

  const clipboardWrite = async text => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
  };

  return (
    <main className="streamer-dashboard" aria-labelledby="streamer-dashboard-title">
      <div className="sd-header">
        <h3 id="streamer-dashboard-title">Streamer Dashboard</h3>
        <div className="sd-controls">
          <label htmlFor="live-id-input" className="sd-label">
            Live ID
          </label>
          <input
            id="live-id-input"
            className="sd-input"
            value={liveId}
            onChange={e => setLiveId(e.target.value)}
            aria-label="Live ID"
          />
          <button
            className="sd-btn"
            onClick={handleCreate}
            disabled={creating}
            aria-disabled={creating}
            aria-live="polite"
          >
            {creating ? "Creating…" : "Create Private Link"}
          </button>
          <button className="sd-btn sd-ghost" onClick={fetchTokens} aria-label="Refresh tokens">
            Refresh
          </button>
        </div>
      </div>

      <section className="sd-section" aria-label="Active tokens">
        {recentTips.length > 0 && (
          <div className="sd-tips">
            <strong>Recent tips</strong>
            <ul>
              {recentTips.map((t, i) => (
                <li key={i}>
                  {t.payer ? `${t.payer}: ` : ""}
                  {t.amount} {t.currency} — {new Date(t.time).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          </div>
        )}
        <h4>Active tokens</h4>
        <div role="status" aria-live="polite" className="sd-status" />

        <table className="sd-table" role="table">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Uses</th>
              <th scope="col">Max</th>
              <th scope="col">Expires</th>
              <th scope="col">Revoked</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="sd-empty">
                  No tokens yet — create one to start sharing.
                </td>
              </tr>
            )}
            {tokens.map(t => (
              <tr key={t.token} className={t.revoked ? "sd-revoked" : ""}>
                <td className="sd-token" title={t.token}>
                  {t.token}
                </td>
                <td>{t.uses}</td>
                <td>{t.maxUses || "∞"}</td>
                <td>
                  {t.expiresAt
                    ? new Date(t.expiresAt).toLocaleString
                      ? new Date(t.expiresAt).toLocaleString()
                      : String(t.expiresAt)
                    : "-"}
                </td>
                <td>{t.revoked ? "Yes" : "No"}</td>
                <td>
                  <button
                    className="sd-small"
                    onClick={() =>
                      clipboardWrite(
                        `${window.location.origin}/live/${encodeURIComponent(liveId)}?token=${encodeURIComponent(t.token)}`
                      )
                    }
                    aria-label={`Copy link for token ${t.token}`}
                  >
                    Copy
                  </button>
                  <button
                    className="sd-small sd-danger"
                    onClick={() => handleRevoke(t.token)}
                    aria-label={`Revoke token ${t.token}`}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
