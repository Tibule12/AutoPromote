import React from "react";

const RewardsPanel = ({ badges }) => {
  // calculate "next level" progress mock
  const totalBadges = 12;
  const earnedCount = Array.isArray(badges) ? badges.length : 0;
  const progress = Math.min(100, Math.round((earnedCount / totalBadges) * 100));

  return (
    <section className="rewards-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Rewards & Badges</h3>
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          Level {Math.floor(earnedCount / 3) + 1} Creator
        </div>
      </div>

      {/* Level Progress Bar */}
      <div
        style={{
          background: "#e5e7eb",
          borderRadius: 8,
          height: 8,
          width: "100%",
          margin: "1rem 0 1.5rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(90deg, #4f46e5, #9333ea)",
            width: `${progress}%`,
            height: "100%",
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {Array.isArray(badges) && badges.length ? (
        <div
          className="rewards-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "1rem",
          }}
        >
          {badges.map((b, i) => (
            <div
              key={i}
              className="reward-item"
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "1rem",
                textAlign: "center",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{b.icon || "🏆"}</div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                {b.title || b.name || "Badge"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                {b.description || "Unlocked!"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            background: "#f9fafb",
            borderRadius: 12,
            color: "#9ca3af",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎲</div>
          <p>Start posting content to unlock your first badge!</p>
        </div>
      )}
    </section>
  );
};

export default RewardsPanel;
