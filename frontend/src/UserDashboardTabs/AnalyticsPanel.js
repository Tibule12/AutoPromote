import React, { useState, useEffect, useCallback } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import "./AnalyticsPanel.css";

const AnalyticsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState("7d");
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(
    async ({ retryCount = 0, forceRefreshToken = false } = {}) => {
      if (retryCount === 0) setLoading(true);

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setAnalytics(null);
          setError("Sign in to load analytics.");
          return;
        }

        const token = await currentUser.getIdToken(forceRefreshToken);
        const res = await fetch(`${API_ENDPOINTS.ANALYTICS_USER}?range=${timeRange}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }).catch(() => ({ ok: false, status: 500 }));

        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
          setError("");
          return;
        }

        if (res.status === 401 && !forceRefreshToken) {
          // Token may be expired; refresh once and retry immediately.
          await loadAnalytics({ retryCount, forceRefreshToken: true });
          return;
        }

        if (res.status === 429 && retryCount < 2) {
          const delay = Math.pow(2, retryCount) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
          await loadAnalytics({ retryCount: retryCount + 1, forceRefreshToken });
          return;
        }

        setAnalytics(null);
        setError(
          res.status === 403
            ? "You do not have permission to view analytics."
            : "Could not load analytics right now."
        );
      } catch (_e) {
        setAnalytics(null);
        setError("Could not load analytics right now.");
      } finally {
        if (retryCount === 0) setLoading(false);
      }
    },
    [timeRange]
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) loadAnalytics();
    });
    return () => unsubscribe();
  }, [loadAnalytics]);

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
    publishedPostCount: 0,
    dataSource: null,
    viralityTracker: { views: 0, nextGoal: 30000, potentialBonus: 3 },
    referralTracker: { total: 0, nextGoal: 10, potentialBonus: 5 },
  };

  const sortedPlatformBreakdown = Object.entries(stats.platformBreakdown || {}).sort((a, b) => {
    const aViews = Number((a[1] && a[1].views) || 0);
    const bViews = Number((b[1] && b[1].views) || 0);
    if (bViews !== aViews) return bViews - aViews;
    const aClicks = Number((a[1] && a[1].clicks) || 0);
    const bClicks = Number((b[1] && b[1].clicks) || 0);
    return bClicks - aClicks;
  });

  const hasNoDataForRange =
    !loading &&
    !error &&
    (stats.publishedPostCount || 0) === 0 &&
    (stats.publishedPostCountAllTime || 0) > 0;

  const formatRangeDate = value => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const rangeStartLabel = formatRangeDate(stats.rangeStartAt);
  const rangeEndLabel = formatRangeDate(stats.rangeEndAt);

  return (
    <section className="analytics-panel">
      <div
        className="ap-analytics-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Published Content Analytics</h3>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Real performance from published platform posts
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
          <option value="all">All Time</option>
        </select>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.8rem 1rem",
            borderRadius: 10,
            background: "rgba(239,68,68,0.12)",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      {(analytics?.lastUpdatedAt || analytics?.nextUpdateAt) && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            fontSize: "0.8rem",
            color: "#94a3b8",
            marginBottom: "1rem",
          }}
        >
          {analytics?.lastUpdatedAt && (
            <span>Last updated: {new Date(analytics.lastUpdatedAt).toLocaleString()}</span>
          )}
          {analytics?.nextUpdateAt && (
            <span>Next update: {new Date(analytics.nextUpdateAt).toLocaleString()}</span>
          )}
        </div>
      )}

      {stats.dataSource === "published_platform_posts" ? (
        <div
          className="ap-analytics-source"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.35)",
            color: "#cbd5e1",
            fontSize: ".85rem",
          }}
        >
          Data source: published platform posts only ({stats.publishedPostCount || 0} posts in this
          range).
          {rangeEndLabel ? (
            <span style={{ display: "block", marginTop: ".35rem", color: "#94a3b8" }}>
              Date range: {rangeStartLabel || "Beginning"} to {rangeEndLabel}
            </span>
          ) : null}
          {typeof stats.postsWithoutEventDate === "number" && stats.postsWithoutEventDate > 0 ? (
            <span style={{ display: "block", marginTop: ".35rem", color: "#94a3b8" }}>
              {stats.postsWithoutEventDate} published post(s) missing event date are excluded from
              time-window filters.
            </span>
          ) : null}
        </div>
      ) : null}

      {hasNoDataForRange ? (
        <div className="ap-analytics-empty-window">
          No published platform posts were found for this time window. Try <b>All Time</b> to see
          full history.
        </div>
      ) : null}

      {/* --- SALES SHARK PROGRESS TRACKERS --- */}
      {analytics && (
        <div
          className="ap-analytics-trackers"
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
              🔥 Top Post Reach
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
              Next benchmark: {stats.viralityTracker?.nextGoal?.toLocaleString()} views.
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
              🚀 Referral Progress
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
              {Math.max(
                0,
                (stats.referralTracker?.nextGoal || 0) - (stats.referralTracker?.total || 0)
              )}{" "}
              more referrals to the next goal.
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
        className="platform-breakdown ap-analytics-panel-card"
        style={{
          background: "var(--card)",
          padding: "1.5rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Platform Breakdown</h4>
        {sortedPlatformBreakdown.length > 0 ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {sortedPlatformBreakdown.map(([platform, data]) => (
              <div
                key={platform}
                className="ap-platform-row"
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
                <div
                  className="ap-platform-row-stats"
                  style={{ display: "flex", gap: "1rem", color: "var(--muted)" }}
                >
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
        className="recent-content ap-analytics-panel-card"
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
                className="ap-top-content-row"
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
                  className="ap-top-content-title"
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
                  className="ap-top-content-stats"
                  style={{
                    display: "flex",
                    gap: "0.85rem",
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      textTransform: "capitalize",
                      color: "#cbd5e1",
                      background: "rgba(59,130,246,0.16)",
                      borderRadius: 999,
                      padding: "0.15rem 0.5rem",
                    }}
                  >
                    {item.platform || "n/a"}
                  </span>
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
