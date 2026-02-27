import React, { useEffect, useState, useRef } from "react";
import "./LiveLogViewer.css"; // We'll create this CSS too
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";

const LiveLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(true);
  const logsEndRef = useRef(null);

  const fetchLogs = async () => {
    if (!active) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) return;

      const url = `${API_BASE_URL}/api/admin/system/logs/live`;
      console.log("[LiveLog] Fetching logs from:", url); // Debug log to see actual URL

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn(`[LiveLog] HTTP error: status=${res.status}`);
        if (res.status === 404) {
          setError("Log endpoint not found (404)");
        }
        return;
      }

      const debugText = await res.text();
      let data;
      try {
        data = JSON.parse(debugText);
      } catch (parseErr) {
        console.error("[LiveLog] JSON parse failed. Response was:", debugText.slice(0, 100));
        // If we get HTML (e.g. index.html), show meaningful error
        if (
          debugText.trim().startsWith("<!DOCTYPE html>") ||
          debugText.trim().startsWith("<html")
        ) {
          setError("API Error: Endpoint returned HTML (Check API URL)");
        } else {
          setError("API Error: Invalid JSON response");
        }
        return;
      }

      if (data.success && Array.isArray(data.logs)) {
        // Process logs for display
        const processed = data.logs.map((line, idx) => {
          // Basic parsing similar to the PowerShell script
          let type = "info";
          let message = line;

          if (line.includes("POST /api/auth/login")) {
            type = "login";
            message = "👤 New User Login";
          } else if (line.includes("POST /api/content/upload")) {
            type = "upload";
            message = "📹 NEW VIDEO UPLOAD DETECTED!";
          } else if (line.includes("POST /api/payments")) {
            type = "revenue";
            message = "💰💰💰 REVENUE EVENT";
          } else if (line.includes("POST /api/clips")) {
            type = "credit";
            message = "💎 CREDIT SPEND: Clip Analysis";
          } else if (line.includes("render-clip")) {
            type = "credit";
            message = "💎 CREDIT SPEND: Rendering (~50 credits)";
          } else if (line.includes("status=500") || line.includes("status=400")) {
            type = "error";
          } else if (line.includes("status=200") || line.includes("status=204")) {
            type = "success";
          } else if (line.includes("status=304")) {
            type = "cache";
          }

          return { raw: line, type, message, id: idx };
        });

        setLogs(processed);
        setError(null);
      }
    } catch (err) {
      console.error("Live log fetch error:", err);
      // Don't show error to UI to avoid flickering, just stop updating
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(); // Initial fetch
    const interval = setInterval(fetchLogs, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [active]);

  useEffect(() => {
    // Auto-scroll to bottom
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="live-log-container">
      <div className="live-log-header">
        <h4>🔴 Live System Feed</h4>
        <button onClick={() => setActive(!active)} className="live-toggle">
          {active ? "Pause" : "Resume"}
        </button>
      </div>
      <div className="live-log-console">
        {logs.length === 0 && !loading && <div className="log-line">Waiting for events...</div>}
        {logs.map((log, i) => (
          <div key={i} className={`log-line log-${log.type}`}>
            <span className="log-ts">{new Date().toLocaleTimeString()}</span>{" "}
            {log.type !== "info" && log.type !== "success" ? (
              <span className="log-highlight">{log.message}</span>
            ) : (
              <span className="log-raw">{log.raw}</span>
            )}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default LiveLogViewer;
