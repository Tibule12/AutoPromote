import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";

const RewardsPanel = ({ badges }) => {
  const [analytics, setAnalytics] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadRewardsData();
  }, []);

  const loadRewardsData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken(true);

      // We use the analytics endpoint because it now returns referralCode and trackers
      const res = await fetch(`${API_ENDPOINTS.ANALYTICS}/user?range=30d`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      // Silent fail
    }
  };

  const copyToClipboard = () => {
    if (analytics?.referralCode) {
      const link = `${window.location.origin}/signup?ref=${analytics.referralCode}`;
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Safe defaults
  const stats = analytics || {};
  const referralTracker = stats.referralTracker || { total: 0, nextGoal: 10, potentialBonus: 5 };
  const viralityTracker = stats.viralityTracker || { views: 0, nextGoal: 30000, potentialBonus: 3 };
  const refLink = stats.referralCode
    ? `${window.location.origin}/signup?ref=${stats.referralCode}`
    : "Loading...";

  return (
    <section className="rewards-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h3>Growth & Rewards</h3>
        {stats.referralCode && (
          <div
            style={{
              background: "#ecfdf5",
              color: "#059669",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "0.8rem",
              fontWeight: "bold",
            }}
          >
            Active Ambassador
          </div>
        )}
      </div>

      {/* --- REFERRAL ENGINE SECTION --- */}
      <div
        className="referral-card"
        style={{
          background: "var(--card)",
          padding: "1.5rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          marginBottom: "2rem",
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>🔗 Your Referral Engine</h4>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Share your link. Earn <b>$5</b> for every paid subscriber, and unlock <b>$15</b> bonuses
          for free signups!
        </p>

        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            readOnly
            value={refLink}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "#f9fafb",
              color: "#374151",
            }}
          />
          <button
            onClick={copyToClipboard}
            style={{
              padding: "0 20px",
              background: copied ? "#10b981" : "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>

      {/* --- ACTIVE MISSIONS --- */}
      <h4 style={{ marginBottom: "1rem" }}>🎯 Active Daily Missions</h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.5rem",
          marginBottom: "2.5rem",
        }}
      >
        {/* Mission 1: Referrals */}
        <div
          style={{
            background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid #10b981",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontWeight: "bold", color: "#047857" }}>👥 Level 2: Ambassador</span>
            <span style={{ fontWeight: "bold", color: "#059669" }}>
              ${referralTracker.potentialBonus} Reward
            </span>
          </div>
          <div style={{ fontSize: "0.9rem", marginBottom: "10px", color: "#065f46" }}>
            Refer {referralTracker.nextGoal} active users
          </div>
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "rgba(0,0,0,0.1)",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (referralTracker.total / referralTracker.nextGoal) * 100)}%`,
                height: "100%",
                background: "#10b981",
              }}
            ></div>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            Current: {referralTracker.total} / {referralTracker.nextGoal} referrals
            {/* Anti-Fraud Warning */}
            <div style={{ marginTop: "5px", fontSize: "0.75rem", color: "#dc2626" }}>
              * Requires active subscription + No fake accounts.
            </div>
          </div>
        </div>

        {/* Mission 2: Viral Views */}
        <div
          style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 100%)",
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid #6366f1",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontWeight: "bold", color: "#4338ca" }}>🔥 Viral Content Bonus</span>
            <span style={{ fontWeight: "bold", color: "#4f46e5" }}>
              ${viralityTracker.potentialBonus} Reward
            </span>
          </div>
          <div style={{ fontSize: "0.9rem", marginBottom: "10px", color: "#3730a3" }}>
            Get a video to {viralityTracker.nextGoal.toLocaleString()} views
          </div>
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "rgba(0,0,0,0.1)",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (viralityTracker.views / viralityTracker.nextGoal) * 100)}%`,
                height: "100%",
                background: "#6366f1",
              }}
            ></div>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            Top Video: {viralityTracker.views.toLocaleString()} views
          </div>
        </div>
      </div>

      {/* --- OLD BADGES (TROPHY CASE) --- */}
      <h4 style={{ marginBottom: "1rem", color: "#9ca3af" }}>🏆 Trophy Case</h4>
      <div className="badges-scroll-container">
        {Array.isArray(badges) && badges.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
              gap: "10px",
            }}
          >
            {badges.map((b, i) => (
              <div key={i} style={{ textAlign: "center", opacity: 0.7 }}>
                <div style={{ fontSize: "1.5rem" }}>{b.icon || "🏅"}</div>
                <div style={{ fontSize: "0.7rem" }}>{b.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            No trophies yet. Complete missions to earn them!
          </p>
        )}
      </div>
    </section>
  );
};

export default RewardsPanel;
