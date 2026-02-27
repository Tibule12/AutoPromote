import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";

const EarningsPanel = ({ earnings, onClaim, onNavigate }) => {
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Run once on mount — load payout history
  /* mount-only effect (intentional) */
  // eslint-disable-next-line
  useEffect(() => {
    loadPayoutHistory();
  }, []);

  const loadPayoutHistory = async (retryCount = 0) => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const token = await currentUser.getIdToken(true);

      const res = await fetch(API_ENDPOINTS.EARNINGS_PAYOUTS, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setPayoutHistory(data.payouts || []);
        } else {
          // Non-JSON response, silently use empty array
          setPayoutHistory([]);
        }
      } else if (res.status === 429 && retryCount < 2) {
        // Rate limited - retry after delay with exponential backoff
        const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s
        setTimeout(() => loadPayoutHistory(retryCount + 1), delay);
        return;
      } else {
        // Endpoint error, silently use empty array
        setPayoutHistory([]);
      }
    } catch (e) {
      // Silently handle errors
      setPayoutHistory([]);
    } finally {
      if (retryCount === 0) setLoading(false);
    }
  };

  return (
    <section className="earnings-panel">
      <h3>Treasury</h3>
      <div
        style={{
          background: "#fff3cd",
          color: "#856404",
          padding: "1rem",
          marginBottom: "1rem",
          borderRadius: "8px",
          border: "1px solid #ffeeba",
        }}
      >
        <strong>Notice:</strong> View-based monetization ("Pay Per View") has been discontinued. We
        are transitioning to a task-based "Mission" economy. Check the Missions tab for active
        bounties.
      </div>

      {earnings ? (
        <>
          <div
            className="earnings-summary"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div
              className="earnings-card"
              style={{
                background: "var(--card)",
                padding: "1.5rem",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                Available Balance
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#10b981" }}>
                ${(earnings.available || 0).toFixed(2)}
              </div>
              <button
                className="check-quality"
                onClick={onClaim}
                disabled={!earnings.available || earnings.available < 10}
                style={{
                  marginTop: "1rem",
                  width: "100%",
                  opacity: earnings.available >= 10 ? 1 : 0.5,
                  cursor: earnings.available >= 10 ? "pointer" : "not-allowed",
                }}
              >
                Request Payout
              </button>
              {earnings.available < 10 && (
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                  Minimum payout: $10.00
                  {onNavigate && (
                    <div
                      onClick={() => onNavigate("rewards")}
                      style={{
                        color: "#4f46e5",
                        cursor: "pointer",
                        marginTop: "8px",
                        fontWeight: "600",
                        textDecoration: "underline",
                      }}
                    >
                      🚀 Boost earnings with referrals
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              className="earnings-card"
              style={{
                background: "var(--card)",
                padding: "1.5rem",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                Pending
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#f59e0b" }}>
                ${(earnings.pending || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "1rem" }}>
                Processing payouts
              </div>
            </div>

            <div
              className="earnings-card"
              style={{
                background: "var(--card)",
                padding: "1.5rem",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                Total Earned
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--brand)" }}>
                $
                {(
                  (earnings.available || 0) +
                  (earnings.pending || 0) +
                  (earnings.paid || 0)
                ).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "1rem" }}>
                Lifetime earnings
              </div>
            </div>
          </div>

          <div
            className="payout-history"
            style={{
              background: "var(--card)",
              padding: "1.5rem",
              borderRadius: "12px",
              border: "1px solid var(--border)",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Payout History</h4>

            {loading ? (
              <div style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
                Loading...
              </div>
            ) : payoutHistory && payoutHistory.length > 0 ? (
              <div className="payout-list">
                {payoutHistory.map((payout, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "1rem",
                      background: "var(--bg-2)",
                      borderRadius: "8px",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>${(payout.amount || 0).toFixed(2)}</div>
                      <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                        {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString() : "N/A"}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        background:
                          payout.status === "completed"
                            ? "#10b98133"
                            : payout.status === "pending"
                              ? "#f59e0b33"
                              : "#ef444433",
                        color:
                          payout.status === "completed"
                            ? "#10b981"
                            : payout.status === "pending"
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    >
                      {payout.status || "unknown"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
                No payout history yet. Request your first payout when you reach $10!
              </div>
            )}
          </div>

          {/* OLD VIEW-BASED TIERS REMOVED */}
          <div
            className="reward-tiers-section"
            style={{
              background: "var(--card)",
              padding: "2rem",
              borderRadius: "12px",
              border: "1px dashed #6366f1", // Using brand color for dashed border
              marginTop: "1.5rem",
              textAlign: "center",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>⚔️ Active Bounties Only</h4>
            <p style={{ color: "var(--muted)", maxWidth: "500px", margin: "0 auto 1.5rem" }}>
              The AutoPromote economy has shifted. You now earn by completing tactical Missions.
              Passive view rewards are no longer available.
            </p>

            <button
              onClick={() => onNavigate && onNavigate("wolf_hunt")}
              style={{
                background: "#6366f1",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "6px",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 4px 14px 0 rgba(99, 102, 241, 0.39)",
              }}
            >
              Go to Missions Board →
            </button>
          </div>

          {/* MILESTONE BONUSES REMOVED - DEPRECATED PAY PER VIEW */}
        </>
      ) : (
        <div style={{ color: "#9aa4b2" }}>Loading earnings...</div>
      )}
    </section>
  );
};

export default EarningsPanel;
