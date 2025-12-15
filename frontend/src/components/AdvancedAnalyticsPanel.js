import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";

function AdvancedAnalyticsPanel() {
  const [view, setView] = useState("ab-tests"); // ab-tests, cohorts, funnel, segments, flags
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Run when `view` changes — `fetchData` intentionally omitted from deps
  /* mount-only effect (intentional) */
  // eslint-disable-next-line
  useEffect(() => {
    fetchData();
  }, [view]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      let endpoint = "";

      switch (view) {
        case "ab-tests":
          endpoint = "/api/admin/analytics/ab-tests";
          break;
        case "cohorts":
          endpoint = "/api/admin/analytics/cohorts?period=week";
          break;
        case "funnel":
          endpoint = "/api/admin/analytics/funnel?timeframe=30d";
          break;
        case "segments":
          endpoint = "/api/admin/analytics/segments";
          break;
        case "flags":
          endpoint = "/api/admin/analytics/flags";
          break;
        default:
          // No-op fallback — ensures switch has a default branch for linting
          break;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) setData(result);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setLoading(false);
    }
  };

  const toggleFeatureFlag = async (flagId, enabled) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/analytics/flags/${flagId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      fetchData();
    } catch (error) {
      console.error("Error toggling feature flag:", error);
    }
  };

  const createFeatureFlag = async () => {
    const name = prompt("Feature flag name:");
    if (!name) return;

    const description = prompt("Description:");
    const rolloutPercentage = parseInt(prompt("Rollout percentage (0-100):") || "100");

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/analytics/flags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description, enabled: false, rolloutPercentage }),
      });
      alert("Feature flag created");
      fetchData();
    } catch (error) {
      console.error("Error creating feature flag:", error);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading analytics...</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* View Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={() => setView("ab-tests")}
          style={view === "ab-tests" ? activeTabStyle : tabStyle}
        >
          A/B Tests
        </button>
        <button
          onClick={() => setView("cohorts")}
          style={view === "cohorts" ? activeTabStyle : tabStyle}
        >
          Cohorts
        </button>
        <button
          onClick={() => setView("funnel")}
          style={view === "funnel" ? activeTabStyle : tabStyle}
        >
          Conversion Funnel
        </button>
        <button
          onClick={() => setView("segments")}
          style={view === "segments" ? activeTabStyle : tabStyle}
        >
          User Segments
        </button>
        <button
          onClick={() => setView("flags")}
          style={view === "flags" ? activeTabStyle : tabStyle}
        >
          Feature Flags
        </button>
      </div>

      {/* A/B Tests View */}
      {view === "ab-tests" && data && (
        <div>
          {data.stats && (
            <div style={{ display: "flex", gap: 15, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={statCardStyle}>
                <div style={statValueStyle}>{data.stats.totalVariants}</div>
                <div style={statLabelStyle}>Total Variants</div>
              </div>
              <div style={statCardStyle}>
                <div style={statValueStyle}>{data.stats.activeVariants}</div>
                <div style={statLabelStyle}>Active Variants</div>
              </div>
              <div style={statCardStyle}>
                <div style={statValueStyle}>{data.stats.avgCtr}%</div>
                <div style={statLabelStyle}>Avg CTR</div>
              </div>
            </div>
          )}

          <div style={containerStyle}>
            <h3>Variant Performance</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Content ID</th>
                  <th style={thStyle}>Platform</th>
                  <th style={thStyle}>Variant</th>
                  <th style={thStyle}>Posts</th>
                  <th style={thStyle}>Clicks</th>
                  <th style={thStyle}>CTR</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.tests &&
                  data.tests.slice(0, 20).map((test, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{test.contentId.substring(0, 8)}...</td>
                      <td style={tdStyle}>{test.platform}</td>
                      <td style={tdStyle}>{test.variant}</td>
                      <td style={tdStyle}>{test.posts}</td>
                      <td style={tdStyle}>{test.clicks}</td>
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: "bold",
                          color: test.ctr > 5 ? "#2e7d32" : "#666",
                        }}
                      >
                        {test.ctr.toFixed(2)}%
                      </td>
                      <td style={tdStyle}>
                        {test.suppressed && <span style={{ color: "#d32f2f" }}>Suppressed</span>}
                        {test.quarantined && <span style={{ color: "#ed6c02" }}>Quarantined</span>}
                        {!test.suppressed && !test.quarantined && (
                          <span style={{ color: "#2e7d32" }}>Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cohorts View */}
      {view === "cohorts" && data && (
        <div style={containerStyle}>
          <h3>Cohort Analysis</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thStyle}>Users</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}>Converted</th>
                <th style={thStyle}>Retention</th>
                <th style={thStyle}>Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts &&
                data.cohorts.map((cohort, idx) => (
                  <tr key={idx}>
                    <td style={tdStyle}>{cohort.cohortKey}</td>
                    <td style={tdStyle}>{cohort.size}</td>
                    <td style={tdStyle}>{cohort.active}</td>
                    <td style={tdStyle}>{cohort.converted}</td>
                    <td style={tdStyle}>{((cohort.active / cohort.size) * 100).toFixed(1)}%</td>
                    <td style={tdStyle}>{((cohort.converted / cohort.size) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Conversion Funnel View */}
      {view === "funnel" && data && (
        <div style={containerStyle}>
          <h3>Conversion Funnel (Last {data.timeframe})</h3>
          <div style={{ marginTop: 20 }}>
            {data.funnel &&
              data.funnel.map((stage, idx) => (
                <div key={idx} style={{ marginBottom: 20 }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}
                  >
                    <strong>{stage.stage}</strong>
                    <span>
                      {stage.count} users ({stage.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: 40,
                      backgroundColor: "#f5f5f5",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${stage.percentage}%`,
                        backgroundColor:
                          idx === 0
                            ? "#1976d2"
                            : idx === 1
                              ? "#2e7d32"
                              : idx === 2
                                ? "#ed6c02"
                                : "#7b1fa2",
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 15,
                        color: "white",
                        fontWeight: "bold",
                        transition: "width 0.5s ease",
                      }}
                    >
                      {stage.count}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* User Segments View */}
      {view === "segments" && data && data.segments && (
        <div>
          <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={containerStyle}>
              <h3>By Plan</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  Free: <strong>{data.segments.byPlan.free}</strong>
                </div>
                <div>
                  Premium: <strong>{data.segments.byPlan.premium}</strong>
                </div>
                <div>
                  Pro: <strong>{data.segments.byPlan.pro}</strong>
                </div>
              </div>
            </div>

            <div style={containerStyle}>
              <h3>By Activity</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  Active: <strong>{data.segments.byActivity.active}</strong>
                </div>
                <div>
                  Inactive: <strong>{data.segments.byActivity.inactive}</strong>
                </div>
              </div>
            </div>

            <div style={containerStyle}>
              <h3>By Content Creation</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  Power Creators: <strong>{data.segments.byContentCreation.powerCreators}</strong>
                </div>
                <div>
                  Regular Creators:{" "}
                  <strong>{data.segments.byContentCreation.regularCreators}</strong>
                </div>
                <div>
                  New Creators: <strong>{data.segments.byContentCreation.newCreators}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature Flags View */}
      {view === "flags" && data && (
        <div>
          <button onClick={createFeatureFlag} style={{ ...successButtonStyle, marginBottom: 20 }}>
            + Create Feature Flag
          </button>

          <div style={containerStyle}>
            <h3>Feature Flags</h3>
            {data.flags &&
              data.flags.map(flag => (
                <div key={flag.id} style={flagCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong>{flag.name}</strong>
                      <div style={{ fontSize: "0.9rem", color: "#666", marginTop: 5 }}>
                        {flag.description}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#999", marginTop: 5 }}>
                        Rollout: {flag.rolloutPercentage}%
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={flag.enabled}
                        onChange={e => toggleFeatureFlag(flag.id, e.target.checked)}
                        style={{ marginRight: 8, cursor: "pointer" }}
                      />
                      <span style={{ color: flag.enabled ? "#2e7d32" : "#666" }}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const tabStyle = {
  padding: "10px 20px",
  border: "1px solid #ddd",
  backgroundColor: "white",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: "0.95rem",
};

const activeTabStyle = {
  ...tabStyle,
  backgroundColor: "#1976d2",
  color: "white",
  borderColor: "#1976d2",
};

const statCardStyle = {
  backgroundColor: "white",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  flex: "1 1 200px",
  minWidth: 150,
};

const statValueStyle = {
  fontSize: "2rem",
  fontWeight: "bold",
  color: "#1976d2",
};

const statLabelStyle = {
  fontSize: "0.9rem",
  color: "#666",
  marginTop: 5,
};

const containerStyle = {
  backgroundColor: "white",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  flex: 1,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 10,
};

const thStyle = {
  textAlign: "left",
  padding: "12px 8px",
  borderBottom: "2px solid #eee",
  fontWeight: "600",
  fontSize: "0.9rem",
};

const tdStyle = {
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  fontSize: "0.9rem",
};

const flagCardStyle = {
  padding: 15,
  borderBottom: "1px solid #eee",
  marginBottom: 10,
};

const successButtonStyle = {
  padding: "10px 20px",
  backgroundColor: "#2e7d32",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: "0.9rem",
};

export default AdvancedAnalyticsPanel;
