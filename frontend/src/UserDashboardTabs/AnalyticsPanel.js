import React, { useState, useEffect, useCallback } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import "./AnalyticsPanel.css";

const AnalyticsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState("7d");
  const [error, setError] = useState("");
  const [contentItems, setContentItems] = useState([]);
  const [selectedContentId, setSelectedContentId] = useState("");
  const [diagnosisData, setDiagnosisData] = useState(null);
  const [recoveryHistory, setRecoveryHistory] = useState([]);
  const [policyState, setPolicyState] = useState({
    enabled: false,
    cadenceHours: 24,
    minHealthScore: 45,
    maxDailyRuns: 2,
    cooldownHours: 6,
    dryRunOnly: false,
  });
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  const authedFetch = useCallback(async (url, options = {}) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Sign in to use recovery tools.");
    const token = await currentUser.getIdToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });
    return res;
  }, []);

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

  const loadRecoveryAssets = useCallback(async () => {
    try {
      const res = await authedFetch(API_ENDPOINTS.MY_CONTENT, { method: "GET" });
      if (!res.ok) return;
      const json = await res.json();
      const items = Array.isArray(json.content) ? json.content : [];
      setContentItems(items);
      if (!selectedContentId && items.length) {
        setSelectedContentId(items[0].id || items[0]._id || "");
      }
    } catch (_e) {
      // Recovery tools are optional; fail silently to avoid blocking analytics panel.
    }
  }, [authedFetch, selectedContentId]);

  const loadRecoveryForContent = useCallback(
    async contentId => {
      if (!contentId) return;
      setRecoveryLoading(true);
      setRecoveryMessage("");
      try {
        const [diagRes, histRes, policyRes] = await Promise.all([
          authedFetch(`${API_ENDPOINTS.CONTENT_DIAGNOSIS(contentId)}?refresh=1`),
          authedFetch(`${API_ENDPOINTS.CONTENT_DIAGNOSIS_HISTORY(contentId)}?limit=10`),
          authedFetch(API_ENDPOINTS.CONTENT_DIAGNOSIS_POLICY(contentId)),
        ]);

        if (diagRes.ok) {
          const d = await diagRes.json();
          setDiagnosisData(d.diagnosis || null);
        }
        if (histRes.ok) {
          const h = await histRes.json();
          setRecoveryHistory(Array.isArray(h.history) ? h.history : []);
        }
        if (policyRes.ok) {
          const p = await policyRes.json();
          if (p.policy && p.policy.policy) {
            setPolicyState(prev => ({ ...prev, ...p.policy.policy }));
          }
        }
      } catch (_e) {
        setRecoveryMessage("Could not load recovery details for this content.");
      } finally {
        setRecoveryLoading(false);
      }
    },
    [authedFetch]
  );

  useEffect(() => {
    loadRecoveryAssets();
  }, [loadRecoveryAssets]);

  useEffect(() => {
    if (selectedContentId) loadRecoveryForContent(selectedContentId);
  }, [selectedContentId, loadRecoveryForContent]);

  const runRemediation = async dryRun => {
    if (!selectedContentId) return;
    setRecoveryLoading(true);
    setRecoveryMessage("");
    try {
      const res = await authedFetch(API_ENDPOINTS.CONTENT_DIAGNOSIS_REMEDIATE(selectedContentId), {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error("Remediation failed");
      const data = await res.json();
      const count = Array.isArray(data.remediation?.actions) ? data.remediation.actions.length : 0;
      setRecoveryMessage(
        dryRun
          ? `Dry run complete. ${count} action(s) planned.`
          : `Remediation executed. ${count} action(s) processed.`
      );
      await loadRecoveryForContent(selectedContentId);
    } catch (_e) {
      setRecoveryMessage("Remediation request failed. Please retry.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const savePolicy = async () => {
    if (!selectedContentId) return;
    setPolicySaving(true);
    setRecoveryMessage("");
    try {
      const res = await authedFetch(API_ENDPOINTS.CONTENT_DIAGNOSIS_POLICY(selectedContentId), {
        method: "PUT",
        body: JSON.stringify(policyState),
      });
      if (!res.ok) throw new Error("Policy save failed");
      setRecoveryMessage("Auto-recovery policy saved.");
      await loadRecoveryForContent(selectedContentId);
    } catch (_e) {
      setRecoveryMessage("Failed to save policy.");
    } finally {
      setPolicySaving(false);
    }
  };

  const runAutoPolicyNow = async dryRun => {
    if (!selectedContentId) return;
    setRecoveryLoading(true);
    setRecoveryMessage("");
    try {
      const res = await authedFetch(API_ENDPOINTS.CONTENT_DIAGNOSIS_RUN_AUTO(selectedContentId), {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error("Auto-run failed");
      const data = await res.json();
      const skipped = Boolean(data.autoRun && data.autoRun.skipped);
      setRecoveryMessage(
        skipped
          ? `Auto policy skipped (${data.autoRun.reason || "not_due_or_policy_disabled"}).`
          : dryRun
            ? "Auto policy dry run completed."
            : "Auto policy run completed."
      );
      await loadRecoveryForContent(selectedContentId);
    } catch (_e) {
      setRecoveryMessage("Failed to run auto policy.");
    } finally {
      setRecoveryLoading(false);
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

      <div
        className="ap-analytics-panel-card"
        style={{
          background: "var(--card)",
          padding: "1rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h4 style={{ margin: 0 }}>Recovery Lab</h4>
            <div style={{ color: "var(--muted)", fontSize: ".82rem", marginTop: "0.2rem" }}>
              Diagnose weak content, run remediation, and configure guardrails.
            </div>
          </div>
          <select
            value={selectedContentId}
            onChange={e => setSelectedContentId(e.target.value)}
            style={{
              minWidth: 220,
              padding: "0.45rem 0.6rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-2)",
              color: "var(--text)",
            }}
          >
            <option value="">Select content…</option>
            {contentItems.map(item => (
              <option key={item.id || item._id} value={item.id || item._id}>
                {(item.title || "Untitled").slice(0, 48)}
              </option>
            ))}
          </select>
        </div>

        {recoveryMessage ? (
          <div style={{ marginTop: ".85rem", color: "#93c5fd", fontSize: ".85rem" }}>
            {recoveryMessage}
          </div>
        ) : null}

        {diagnosisData ? (
          <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.5rem" }}>
            <div style={{ fontSize: ".88rem" }}>
              Status: <b style={{ textTransform: "capitalize" }}>{diagnosisData.status}</b> | Health
              Score: <b>{diagnosisData.healthScore}</b>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {(diagnosisData.issues || []).slice(0, 5).map(issue => (
                <span
                  key={`${issue.type}-${issue.severity}`}
                  style={{
                    fontSize: ".75rem",
                    background: "rgba(248,113,113,0.15)",
                    border: "1px solid rgba(248,113,113,0.35)",
                    borderRadius: 999,
                    padding: "0.2rem 0.5rem",
                    color: "#fecaca",
                  }}
                >
                  {issue.type}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
          <button
            disabled={!selectedContentId || recoveryLoading}
            onClick={() => runRemediation(true)}
          >
            Dry Run Remediation
          </button>
          <button
            disabled={!selectedContentId || recoveryLoading}
            onClick={() => runRemediation(false)}
          >
            Execute Remediation
          </button>
          <button
            disabled={!selectedContentId || recoveryLoading}
            onClick={() => runAutoPolicyNow(true)}
          >
            Dry Run Auto Policy
          </button>
          <button
            disabled={!selectedContentId || recoveryLoading}
            onClick={() => runAutoPolicyNow(false)}
          >
            Run Auto Policy
          </button>
        </div>

        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gap: "0.65rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <label style={{ fontSize: ".8rem" }}>
            <input
              type="checkbox"
              checked={Boolean(policyState.enabled)}
              onChange={e => setPolicyState(prev => ({ ...prev, enabled: e.target.checked }))}
            />{" "}
            Enable Auto Recovery
          </label>
          <label style={{ fontSize: ".8rem" }}>
            Cadence (hours)
            <input
              type="number"
              min={1}
              max={168}
              value={policyState.cadenceHours}
              onChange={e =>
                setPolicyState(prev => ({ ...prev, cadenceHours: Number(e.target.value || 24) }))
              }
            />
          </label>
          <label style={{ fontSize: ".8rem" }}>
            Min Health Score
            <input
              type="number"
              min={0}
              max={100}
              value={policyState.minHealthScore}
              onChange={e =>
                setPolicyState(prev => ({ ...prev, minHealthScore: Number(e.target.value || 45) }))
              }
            />
          </label>
          <label style={{ fontSize: ".8rem" }}>
            Max Daily Runs
            <input
              type="number"
              min={1}
              max={10}
              value={policyState.maxDailyRuns}
              onChange={e =>
                setPolicyState(prev => ({ ...prev, maxDailyRuns: Number(e.target.value || 2) }))
              }
            />
          </label>
          <label style={{ fontSize: ".8rem" }}>
            Cooldown (hours)
            <input
              type="number"
              min={1}
              max={48}
              value={policyState.cooldownHours}
              onChange={e =>
                setPolicyState(prev => ({ ...prev, cooldownHours: Number(e.target.value || 6) }))
              }
            />
          </label>
          <label style={{ fontSize: ".8rem" }}>
            <input
              type="checkbox"
              checked={Boolean(policyState.dryRunOnly)}
              onChange={e => setPolicyState(prev => ({ ...prev, dryRunOnly: e.target.checked }))}
            />{" "}
            Dry Run Only
          </label>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <button disabled={!selectedContentId || policySaving} onClick={savePolicy}>
            {policySaving ? "Saving..." : "Save Policy"}
          </button>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <h5 style={{ margin: 0, marginBottom: ".4rem" }}>Recent Recovery Actions</h5>
          {recoveryLoading ? (
            <div style={{ color: "var(--muted)", fontSize: ".82rem" }}>
              Loading recovery data...
            </div>
          ) : recoveryHistory.length ? (
            <div style={{ display: "grid", gap: ".45rem" }}>
              {recoveryHistory.slice(0, 5).map(entry => (
                <div
                  key={entry.id || entry.executedAt}
                  style={{
                    fontSize: ".8rem",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: ".5rem .65rem",
                    background: "var(--bg-2)",
                  }}
                >
                  <div>
                    {entry.executedAt
                      ? new Date(entry.executedAt).toLocaleString()
                      : "Unknown time"}{" "}
                    | {entry.diagnosisStatus || "n/a"}
                  </div>
                  <div style={{ color: "var(--muted)", marginTop: ".2rem" }}>
                    {Array.isArray(entry.actions)
                      ? entry.actions.map(a => `${a.type}:${a.status}`).join(" | ")
                      : "No action details"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: ".82rem" }}>
              No remediation history yet.
            </div>
          )}
        </div>
      </div>

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h4 style={{ margin: 0 }}>Top Performing Content</h4>
          {stats.topContent && stats.topContent.length > 5 && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Showing {Math.min(stats.topContent.length, 50)} items
            </span>
          )}
        </div>
        {stats.topContent && stats.topContent.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              maxHeight: "400px",
              overflowY: "auto",
              paddingRight: "4px",
            }}
          >
            {stats.topContent.slice(0, 50).map((item, idx) => (
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    overflow: "hidden",
                    marginRight: "1rem",
                  }}
                >
                  <span
                    className="ap-top-content-title"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}
                    title={item.title || "Untitled"}
                  >
                    {item.title || "Untitled"}
                  </span>
                  {item.publishedAt && (
                    <span
                      style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}
                    >
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
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
