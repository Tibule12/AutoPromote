import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";

const AnalyticsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async (retryCount = 0) => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }
      // Use cached token unless expired to improve reliability
      const token = await currentUser.getIdToken();

      // Fetch user analytics
      const res = await fetch(`${API_ENDPOINTS.ANALYTICS_USER}?range=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ ok: false, status: 500 }));

      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      } else if (res.status === 429 && retryCount < 2) {
        // Rate limited - retry after delay with exponential backoff
        const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s
        setTimeout(() => loadAnalytics(retryCount + 1), delay);
        return;
      } else {
        // Backend error or endpoint not ready, use default data
        setAnalytics(null);
      }
    } catch (e) {
      // Silently handle errors
      setAnalytics(null);
    } finally {
      if (retryCount === 0) setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="analytics-panel">
        <h3>Analytics</h3>
        <div className="loading-skeleton">
          <div className="skeleton-card" style={{ height: 120, marginBottom: 16 }}></div>
          <div className="skeleton-card" style={{ height: 120, marginBottom: 16 }}></div>
          <div className="skeleton-card" style={{ height: 120, marginBottom: 16 }}></div>
        </div>
      </section>
    );
  }

  const stats = analytics || {
    totalViews: 0,
    totalClicks: 0,
    ctr: 0,
    topPlatform: "N/A",
    platformBreakdown: {},
    viralityTracker: { views: 0, nextGoal: 30000, potentialBonus: 3 },
    referralTracker: { total: 0, nextGoal: 10, potentialBonus: 5 },
  };

  return (
    <section className="analytics-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>MISSION INTELLIGENCE</h3>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Live debriefing from the field
          </span>
        </div>
        <select
          value={timeRange}
          onChange={e => setTimeRange(e.target.value)}
          style={{
            padding: "0.5rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
          }}
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* --- SALES SHARK PROGRESS TRACKERS --- */}
      {analytics && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          {/* Virality Progress */}
          <div
            style={{
              background: "var(--card)",
              padding: "1.5rem",
              borderRadius: "12px",
              border: "1px solid #6366f1",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", color: "#6366f1" }}>
              🔥 VIRAL BONUS TRACKER
            </h4>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span>Top Video: {stats.viralityTracker?.views.toLocaleString()} views</span>
              <span>Goal: {stats.viralityTracker?.nextGoal?.toLocaleString()}</span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                background: "#333",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (stats.viralityTracker?.views / stats.viralityTracker?.nextGoal) * 100)}%`,
                  height: "100%",
                  background: "#6366f1",
                  transition: "width 0.5s",
                }}
              ></div>
            </div>
            <p style={{ fontSize: "0.8rem", marginTop: "8px", color: "#9aa4b2" }}>
              Reach {stats.viralityTracker?.nextGoal?.toLocaleString()} views to unlock{" "}
              <b>Rank Up</b> rewards!
            </p>
          </div>

          {/* Referral Progress */}
          <div
            style={{
              background: "var(--card)",
              padding: "1.5rem",
              borderRadius: "12px",
              border: "1px solid #10b981",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9rem", color: "#10b981" }}>
              🚀 REFERRAL TRACKER
            </h4>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span>Referrals: {stats.referralTracker?.total}</span>
              <span>Goal: {stats.referralTracker?.nextGoal}</span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                background: "#333",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (stats.referralTracker?.total / stats.referralTracker?.nextGoal) * 100)}%`,
                  height: "100%",
                  background: "#10b981",
                  transition: "width 0.5s",
                }}
              ></div>
            </div>
            <p style={{ fontSize: "0.8rem", marginTop: "8px", color: "#9aa4b2" }}>
              Refer {stats.referralTracker?.nextGoal - stats.referralTracker?.total} more friends to
              unlock <b>Mission Credits</b>!
            </p>
          </div>
        </div>
      )}
      {/* ------------------------------------- */}

      <div
        className="analytics-kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div
          className="kpi-card"
          style={{
            background: "var(--card)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Total Views
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--text)" }}>
            {stats.totalViews?.toLocaleString() || 0}
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            background: "var(--card)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Total Clicks
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--text)" }}>
            {stats.totalClicks?.toLocaleString() || 0}
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            background: "var(--card)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Click-Through Rate
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--brand)" }}>
            {stats.ctr?.toFixed(2) || 0}%
          </div>
        </div>

        <div
          className="kpi-card"
          style={{
            background: "var(--card)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Top Platform
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: "var(--text)",
              textTransform: "capitalize",
            }}
          >
            {stats.topPlatform || "N/A"}
          </div>
        </div>
      </div>

      <div
        className="platform-breakdown"
        style={{
          background: "var(--card)",
          padding: "1.5rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Platform Breakdown</h4>
        {stats.platformBreakdown && Object.keys(stats.platformBreakdown).length > 0 ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {Object.entries(stats.platformBreakdown).map(([platform, data]) => (
              <div
                key={platform}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{platform}</span>
                <div style={{ display: "flex", gap: "1rem", color: "var(--muted)" }}>
                  <span>{data.views || 0} views</span>
                  <span>{data.clicks || 0} clicks</span>
                  <span style={{ color: "var(--brand)" }}>{data.ctr?.toFixed(1) || 0}% CTR</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
            No platform data yet. Start uploading content to see analytics!
          </div>
        )}
      </div>

      <div
        className="recent-content"
        style={{
          background: "var(--card)",
          padding: "1.5rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Top Performing Content</h4>
        {stats.topContent && stats.topContent.length > 0 ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {stats.topContent.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "var(--bg-2)",
                  borderRadius: "8px",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title || "Untitled"}
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>👁 {item.views || 0}</span>
                  <span>🖱 {item.clicks || 0}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
            No content data available yet.
          </div>
        )}
      </div>
    </section>
  );
};

export default AnalyticsPanel;
