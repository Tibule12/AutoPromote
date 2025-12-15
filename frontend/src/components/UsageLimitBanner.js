// UsageLimitBanner.js
// Display user's upload limit and upgrade prompt

import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import "./UsageLimitBanner.css";

const UsageLimitBanner = () => {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsageStats();
  }, []);

  const loadUsageStats = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/usage/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsage(data.stats);
      }
    } catch (error) {
      console.error("Failed to load usage stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    // Navigate to pricing page (use hash router so we don't hit server)
    window.location.hash = "#/pricing";
  };

  if (loading || !usage || usage.isPaid) {
    return null; // Don't show banner for paid users
  }

  const percentUsed = Math.round((usage.used / usage.limit) * 100);
  const isNearLimit = percentUsed >= 80;
  const isAtLimit = usage.remaining === 0;

  return (
    <div
      className={`usage-banner ${isAtLimit ? "limit-reached" : isNearLimit ? "near-limit" : ""}`}
    >
      <div className="usage-banner-content">
        <div className="usage-info">
          <div className="usage-text">
            {isAtLimit ? (
              <>
                <span className="usage-icon">⚠️</span>
                <strong>Upload Limit Reached</strong>
                <span className="usage-count">
                  {usage.used}/{usage.limit} uploads used this month
                </span>
              </>
            ) : (
              <>
                <span className="usage-icon">📊</span>
                <strong>Free Tier</strong>
                <span className="usage-count">
                  {usage.remaining} of {usage.limit} uploads remaining this month
                </span>
              </>
            )}
          </div>
          <div className="usage-progress">
            <div className="usage-progress-bar" style={{ width: `${percentUsed}%` }} />
          </div>
        </div>
        <button className="upgrade-button" onClick={handleUpgrade}>
          ⭐ Upgrade for Unlimited
        </button>
      </div>
      {isAtLimit && (
        <div className="limit-message">
          Upgrade to Premium to continue uploading and promoting your content with unlimited uploads
          per month.
        </div>
      )}
    </div>
  );
};

export default UsageLimitBanner;
