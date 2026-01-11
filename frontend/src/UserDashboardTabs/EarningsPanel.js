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
      <h3>Earnings</h3>

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

          <div
            className="reward-tiers-section"
            style={{
              background: "var(--card)",
              padding: "1.5rem",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              marginTop: "1.5rem",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>📊 Performance Reward Tiers</h4>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
              Earn automatic rewards when your content hits these milestones!
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "1rem",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "1rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>👍</div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Good</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  1K+ views, 1%+ engagement
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>$1.00</div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  padding: "1rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🌟</div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Rising</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  5K+ views, 2%+ engagement
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>$5.00</div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  padding: "1rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⭐</div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Popular</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  10K+ views, 3%+ engagement
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>$10.00</div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  padding: "1rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📈</div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Trending</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  50K+ views, 4%+ engagement
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>$25.00</div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  padding: "1rem",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  borderRadius: "8px",
                  color: "white",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔥</div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Viral</div>
                <div style={{ fontSize: "0.75rem", marginBottom: "0.5rem", opacity: 0.9 }}>
                  100K+ views, 5%+ engagement
                </div>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>$50.00</div>
              </div>
            </div>
          </div>

          <div
            className="milestone-bonuses-section"
            style={{
              background: "var(--card)",
              padding: "1.5rem",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              marginTop: "1.5rem",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>🎯 View Milestone Bonuses</h4>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
              Extra rewards when your content reaches these view counts!
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <div
                style={{
                  flex: "1 1 120px",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.25rem" }}
                >
                  10K views
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>+$5</div>
              </div>
              <div
                style={{
                  flex: "1 1 120px",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.25rem" }}
                >
                  50K views
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>+$20</div>
              </div>
              <div
                style={{
                  flex: "1 1 120px",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.25rem" }}
                >
                  100K views
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>+$50</div>
              </div>
              <div
                style={{
                  flex: "1 1 120px",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.25rem" }}
                >
                  500K views
                </div>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>+$200</div>
              </div>
              <div
                style={{
                  flex: "1 1 120px",
                  padding: "0.75rem",
                  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  borderRadius: "8px",
                  textAlign: "center",
                  color: "white",
                }}
              >
                <div style={{ fontSize: "0.875rem", marginBottom: "0.25rem", opacity: 0.9 }}>
                  1M views
                </div>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>+$500</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ color: "#9aa4b2" }}>Loading earnings...</div>
      )}
    </section>
  );
};

export default EarningsPanel;
