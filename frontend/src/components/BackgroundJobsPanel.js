import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";
import { parseJsonSafe } from "../utils/parseJsonSafe";
import { auth } from "../firebaseClient";

function formatDate(value) {
  try {
    if (!value) return "Never recorded";
    if (typeof value?.seconds === "number") {
      return new Date(value.seconds * 1000).toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch (_err) {
    return "Never recorded";
  }
}

export default function BackgroundJobsPanel() {
  const [envStatus, setEnvStatus] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchEnvStatus = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/config/env-status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const parsed = await parseJsonSafe(response);
        if (!mounted) return;
        if (parsed.ok && parsed.json && parsed.json.ok) {
          setEnvStatus(parsed.json);
        }
      } catch (err) {
        console.warn("BackgroundJobsPanel: failed to load env status", err);
      } finally {
        if (mounted) setLoadingEnv(false);
      }
    };

    fetchEnvStatus();
    return () => {
      mounted = false;
    };
  }, []);

  if (loadingEnv) {
    return (
      <div
        data-testid="background-jobs-panel"
        style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
      >
        Loading background job status...
      </div>
    );
  }

  const workerStatus = envStatus?.workerStatus || { required: [], details: {}, staleThresholdSec: 0 };

  return (
    <div
      data-testid="background-jobs-panel"
      style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "#333" }}>Background Jobs</h3>
          <div style={{ color: "#666", fontSize: "0.9rem", marginTop: 4 }}>
            Worker heartbeat visibility from system status records.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: envStatus?.backgroundJobsEnabled ? "#e8f5e9" : "#fff3e0", color: envStatus?.backgroundJobsEnabled ? "#2e7d32" : "#b26a00", fontWeight: 600, fontSize: "0.85rem" }}>
            {envStatus?.backgroundJobsEnabled ? "Enabled" : "Disabled"}
          </span>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: workerStatus.allHealthy ? "#e8f5e9" : "#ffebee", color: workerStatus.allHealthy ? "#2e7d32" : "#c62828", fontWeight: 600, fontSize: "0.85rem" }}>
            {workerStatus.allHealthy ? "Workers Fresh" : "Worker Attention Needed"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {(workerStatus.required || []).map(name => {
          const item = (workerStatus.details && workerStatus.details[name]) || {};
          return (
            <div
              key={name}
              data-testid={`background-job-${name}`}
              style={{ border: `1px solid ${item.ok ? "#c8e6c9" : "#ffcdd2"}`, borderRadius: 10, padding: 14, background: item.ok ? "#f6fff7" : "#fff8f8" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong style={{ color: "#333" }}>{name}</strong>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: item.ok ? "#2e7d32" : "#c62828" }}>
                  {item.ok ? "OK" : item.found ? "Stale" : "Missing"}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#666" }}>
                Last run: {formatDate(item.lastRun)}
              </div>
              {item.status ? (
                <div style={{ marginTop: 4, fontSize: "0.8rem", color: "#666" }}>Status: {item.status}</div>
              ) : null}
              {item.error ? (
                <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#c62828" }}>{item.error}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: "0.8rem", color: "#666" }}>
        Freshness threshold: {workerStatus.staleThresholdSec || 0} seconds.
      </div>
    </div>
  );
}