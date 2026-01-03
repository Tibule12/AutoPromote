import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "./config";
import { auth } from "./firebaseClient";

export default function AfterDarkLanding() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attesting, setAttesting] = useState(false);
  const [attestMsg, setAttestMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = auth.currentUser;
        const token = cur ? await cur.getIdToken(true) : null;
        const res = await fetch(`${API_BASE_URL}/afterdark?limit=50`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Failed to load shows");
        const j = await res.json();
        if (!cancelled) setShows(Array.isArray(j.shows) ? j.shows : []);
      } catch (e) {
        console.warn("AfterDark load failed", e && e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => (cancelled = true);
  }, []);

  if (loading) return <div>Loading AfterDark shows…</div>;
  return (
    <div className="afterdark-landing">
      <h2>AfterDark</h2>
      <p>This area contains adult content and is only visible to verified users.</p>
      <ul>
        {shows.map(s => (
          <li key={s.id}>
            <strong>{s.title}</strong> — {s.description || "No description"}
          </li>
        ))}
      </ul>
      {shows.length === 0 && <div>No shows found.</div>}
      <div style={{ marginTop: 16 }}>
        <p>If you need access, request a quick attestation (placeholder flow).</p>
        <button
          onClick={async () => {
            try {
              setAttesting(true);
              setAttestMsg(null);
              const cur = auth.currentUser;
              const token = cur ? await cur.getIdToken(true) : null;
              // Start attestation session (get a token)
              const startRes = await fetch(`${API_BASE_URL}/api/users/me/kyc/start`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: "same-origin",
              });
              if (!startRes.ok) throw new Error("Failed to start attestation");
              const startJson = await startRes.json();
              const attestToken = startJson.attestationToken;
              if (!attestToken) throw new Error("No attestation token returned");

              // If provider returned a redirect URL, open it and poll for the attestation result.
              if (startJson.redirectUrl) {
                try {
                  // Open provider session in a new tab/window
                  window.open(startJson.redirectUrl, "_blank");

                  // Poll user's profile for afterDarkAccess (timeout ~60s)
                  const pollUntil = Date.now() + 60000;
                  let granted = false;
                  while (Date.now() < pollUntil) {
                    await new Promise(r => setTimeout(r, 1500));
                    const meRes = await fetch(`${API_BASE_URL}/api/users/me`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!meRes.ok) continue;
                    const meJson = await meRes.json().catch(() => ({}));
                    const u = meJson.user || {};
                    if (u.flags && u.flags.afterDarkAccess) {
                      granted = true;
                      break;
                    }
                  }
                  if (granted) {
                    setAttestMsg("Access granted. Refreshing...");
                    setTimeout(() => window.location.reload(), 800);
                  } else {
                    setAttestMsg("Attestation not completed yet. Check the provider window.");
                  }
                } catch (e) {
                  console.warn("Error polling attestation status", e && e.message);
                  setAttestMsg(
                    "Attestation started. Complete the provider flow in the opened window."
                  );
                }
              } else {
                // Present token to server to finalize attestation (fallback)
                const res = await fetch(`${API_BASE_URL}/api/users/me/kyc/attest`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  credentials: "same-origin",
                  body: JSON.stringify({ attestationToken: attestToken }),
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(j.error || "Attestation failed");
                }
                setAttestMsg("Access granted. Refreshing...");
                setTimeout(() => window.location.reload(), 800);
              }
            } catch (err) {
              setAttestMsg(err.message || "Attestation failed");
            } finally {
              setAttesting(false);
            }
          }}
          disabled={attesting}
        >
          {attesting ? "Requesting…" : "Request AfterDark Access"}
        </button>
        {attestMsg && <div style={{ marginTop: 8 }}>{attestMsg}</div>}
      </div>
    </div>
  );
}
