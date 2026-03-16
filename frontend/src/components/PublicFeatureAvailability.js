import React from "react";

const DEFAULT_ITEMS = [
  {
    name: "Publishing queue and scheduling",
    status: "Live",
    description: "Upload once, choose platforms, and send content into immediate or scheduled publishing flows.",
  },
  {
    name: "Analytics and status tracking",
    status: "Live",
    description: "Track upload history, post state, worker health, and available analytics from linked accounts.",
  },
  {
    name: "Editing, clips, captions, and formatting",
    status: "Live",
    description: "Use built-in media tools before publishing rather than relying on fully automatic content rewrites.",
  },
  {
    name: "Platform-specific posting depth",
    status: "Account-dependent",
    description: "Capabilities vary by connected account, API permission level, and active feature flags.",
  },
  {
    name: "Short links and landing flows",
    status: "Deployment-dependent",
    description: "Infrastructure exists, but availability depends on routing and deployment configuration in the running environment.",
  },
];

function tone(status) {
  switch (status) {
    case "Live":
      return { background: "#e8f5e9", color: "#2e7d32" };
    case "Account-dependent":
      return { background: "#e3f2fd", color: "#1565c0" };
    case "Deployment-dependent":
      return { background: "#fff8e1", color: "#b26a00" };
    case "Retired":
      return { background: "#ffebee", color: "#c62828" };
    default:
      return { background: "#eceff1", color: "#455a64" };
  }
}

export default function PublicFeatureAvailability({
  title = "Feature Availability",
  intro = "What AutoPromote supports today, what depends on your setup, and what should not be marketed as active.",
  items = DEFAULT_ITEMS,
}) {
  return (
    <section className="ap-content-section" aria-label="Feature availability">
      <h2>{title}</h2>
      <p>{intro}</p>
      <div className="ap-features-grid">
        {items.map(item => {
          const statusTone = tone(item.status);
          return (
            <div key={item.name} className="ap-feature-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{item.name}</h3>
                <span
                  style={{
                    background: statusTone.background,
                    color: statusTone.color,
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: ".8rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.status}
                </span>
              </div>
              <p style={{ marginBottom: 0 }}>{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}