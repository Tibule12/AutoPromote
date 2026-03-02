import React, { useState, useEffect } from "react";
import "./AdminDashboard.css";
import { API_BASE_URL } from "./config";
import { auth } from "./firebaseClient";

const AdminAuditViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(50);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line
  }, [limit]);

  const fetchLogs = async () => {
    if (loading) return;
    setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;

      // If we aren't logged in, valid fetch will fail, but let the fetch handle 401
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`${API_BASE_URL}/api/admin/system/audit-logs?limit=${limit}`, {
        headers,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLogs(data.logs || []);
      } else {
        // Fallback or error
        setError(data.error || "Failed to load audit logs");
      }
    } catch (err) {
      console.error(err);
      setError("Network error loading logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = isoString => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString();
  };

  return (
    <div className="admin-audit-viewer" style={{ padding: "20px" }}>
      <div
        style={{
          padding: "20px",
          background: "#f3e5f5",
          borderRadius: "8px",
          marginBottom: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          border: "1px solid #e1bee7",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3
              style={{
                margin: 0,
                color: "#7b1fa2",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Security Audit Logs
            </h3>
            <p style={{ margin: "4px 0 0 0", color: "#666", fontSize: "0.9em" }}>
              Track sensitive actions, system events, and security alerts.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              style={{ padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
            >
              <option value="50">Last 50</option>
              <option value="100">Last 100</option>
              <option value="500">Last 500</option>
            </select>
            <button
              onClick={fetchLogs}
              disabled={refreshing}
              style={{
                background: "#7b1fa2",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: refreshing ? "not-allowed" : "pointer",
                opacity: refreshing ? 0.7 : 1,
                fontWeight: "bold",
              }}
            >
              {refreshing ? "Refreshing..." : " Refresh Logs"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "10px",
            borderRadius: "6px",
            marginBottom: "16px",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
          Loading security logs...
        </div>
      ) : (
        <div
          className="table-responsive"
          style={{
            background: "white",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Timestamp
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  User / Admin
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <tr key={log.id || index} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "0.85rem",
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(log.timestamp)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>
                      <span
                        style={{
                          background: log.severity === "high" ? "#fee2e2" : "#f3f4f6",
                          color: log.severity === "high" ? "#b91c1c" : "#374151",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontWeight: 500,
                        }}
                      >
                        {log.action || log.type || "Unknown"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "#6b7280" }}>
                      {log.adminId ? (
                        <div style={{ color: "#d97706" }}> Admin: {log.adminId.slice(0, 8)}...</div>
                      ) : log.userId ? (
                        <div style={{ color: "#2563eb" }}> User: {log.userId.slice(0, 8)}...</div>
                      ) : (
                        <div style={{ color: "#9ca3af" }}> System</div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "0.8rem",
                        color: "#6b7280",
                        fontFamily: "monospace",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "400px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {JSON.stringify(log.details || log.metadata || {}, null, 0)}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}
                  >
                    No audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminAuditViewer;
