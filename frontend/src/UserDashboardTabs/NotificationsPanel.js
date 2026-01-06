import React from "react";

const NotificationsPanel = ({ notifs, onMarkAllRead }) => {
  const getTypeIcon = type => {
    switch (type) {
      case "earnings":
        return "💰";
      case "system":
        return "🔧";
      case "security":
        return "🔒";
      case "viral":
        return "🚀";
      default:
        return "📢";
    }
  };

  const getTypeColor = type => {
    switch (type) {
      case "earnings":
        return "#d1fae5"; // green
      case "security":
        return "#fee2e2"; // red
      case "viral":
        return "#e0e7ff"; // indigo
      default:
        return "#f3f4f6"; // gray
    }
  };

  return (
    <section className="notifications-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3>Notifications</h3>
        {notifs && notifs.length > 0 && (
          <button
            className="check-quality"
            onClick={onMarkAllRead}
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
          >
            Mark all read
          </button>
        )}
      </div>

      {!notifs || notifs.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "#9aa4b2",
            border: "1px dashed #e5e7eb",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
          No new notifications.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
          {notifs.map((n, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
                padding: "1rem",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "1.25rem",
                  background: getTypeColor(n.type),
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  flexShrink: 0,
                }}
              >
                {getTypeIcon(n.type)}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "#1f2937" }}>
                  {n.title}
                </div>
                <div style={{ fontSize: "0.9rem", color: "#4b5563", lineHeight: 1.4 }}>
                  {n.message || n.body}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.5rem" }}>
                  {new Date(n.timestamp || Date.now()).toLocaleDateString()}
                </div>
              </div>

              {/* Unread dot indicator */}
              {!n.read && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#e11d48",
                    position: "absolute",
                    top: 12,
                    right: 12,
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NotificationsPanel;
