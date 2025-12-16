import React from "react";

const RewardsPanel = ({ badges }) => {
  return (
    <section className="rewards-panel">
      <h3>Rewards & Badges</h3>
      {Array.isArray(badges) && badges.length ? (
        <div style={{ display: "grid", gap: ".5rem" }}>
          {badges.map((b, i) => (
            <div key={i} className="reward-item">
              {b.title || b.name || "Badge"} - {b.description || ""}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#9aa4b2" }}>You have no rewards yet.</div>
      )}
    </section>
  );
};

export default RewardsPanel;
