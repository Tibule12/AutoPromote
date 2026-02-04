import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import "../AdminDashboard.css"; // Reuse card styles

function PlatformHealthPanel() {
  const [platforms, setPlatforms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return; // Wait for auth

      const res = await fetch(`${API_BASE_URL}/api/admin/platforms/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlatforms(data.platforms);
      } else {
        setError(data.error || "Failed to load platform status");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 60s
    const timer = setInterval(fetchStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !platforms) {
    return <div className="p-4 text-center">Scanning platform connectivity...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600 bg-red-50 rounded">Error: {error}</div>;
  }

  return (
    <div className="platform-health-grid">
      <h3 className="text-xl font-bold mb-4 flex justify-between items-center">
        <span>Platform Integration Status</span>
        <button
          onClick={fetchStatus}
          className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100"
        >
          Refresh Now
        </button>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms &&
          Object.entries(platforms).map(([key, p]) => (
            <div
              key={key}
              className={`stat-card p-4 rounded-lg border ${p.configured && p.reachable ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-lg capitalize">{p.name}</h4>
                <StatusBadge status={p.configured && p.reachable ? "online" : "issue"} />
              </div>

              <div className="space-y-2 text-sm">
                {/* Configuration Status */}
                <div className="flex justify-between">
                  <span className="text-gray-600">Config:</span>
                  {p.configured ? (
                    <span className="text-green-600 font-medium">Valid</span>
                  ) : (
                    <span
                      className="text-red-600 font-medium cursor-help"
                      title={`Missing: ${p.missingEnv.join(", ")}`}
                    >
                      Missing Keys
                    </span>
                  )}
                </div>

                {/* Network Reachability */}
                <div className="flex justify-between">
                  <span className="text-gray-600">API Access:</span>
                  {p.reachable ? (
                    <span className="text-green-600 font-medium">Reachable</span>
                  ) : (
                    <span className="text-red-600 font-medium">Unreachable</span>
                  )}
                </div>

                {/* Latency */}
                <div className="flex justify-between">
                  <span className="text-gray-600">Latency:</span>
                  <span
                    className={`font-mono ${p.latency > 1000 ? "text-yellow-600" : "text-gray-800"}`}
                  >
                    {p.latency}ms
                  </span>
                </div>

                {/* HTTP Status Response */}
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Response code:</span>
                  <span>{p.httpStatus || "N/A"}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

const StatusBadge = ({ status }) => {
  const styles = {
    online: "bg-green-100 text-green-800",
    issue: "bg-red-100 text-red-800",
    warning: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
};

export default PlatformHealthPanel;
