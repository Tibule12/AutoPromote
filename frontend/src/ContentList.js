import React from "react";

function ContentList({ content }) {
  if (!content || content.length === 0) {
    return <div>No content uploaded yet.</div>;
  }
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Your Content</h3>
      <ul>
        {content.map(item => (
          <li key={item.id || item.title} style={{ marginBottom: 12 }}>
            <strong>{item.title}</strong> ({item.type})<br />
            {item.description && (
              <span>
                {item.description}
                <br />
              </span>
            )}
            {/* PLATFORM DISTRIBUTION STATUS */}
            {item.target_platforms && item.target_platforms.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  fontSize: "0.85rem",
                  marginBottom: "8px",
                }}
              >
                {item.target_platforms.map(platform => {
                  // Check specialized distribution object first, then fallback to naive status
                  const distInfo = item.distribution && item.distribution[platform];
                  const status = distInfo ? distInfo.status : "pending";

                  let color = "#aaa";
                  let icon = "⏳";
                  let text = "Pending";

                  if (status === "published") {
                    color = "#10b981";
                    icon = "✅";
                    text = "Live";
                  }
                  if (status === "processing") {
                    color = "#fbbf24";
                    icon = "⚙️";
                    text = "Processing";
                  }
                  if (status === "failed") {
                    color = "#ef4444";
                    icon = "❌";
                    text = "Failed";
                  }

                  return (
                    <div
                      key={platform}
                      title={`${platform}: ${text}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "16px",
                        background: "rgba(30,30,40,0.6)",
                        border: `1px solid ${color}40`,
                        boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                      }}
                    >
                      <span style={{ fontSize: "1.1em" }}>{icon}</span>
                      <span style={{ textTransform: "capitalize", color: "#ddd", fontWeight: 500 }}>
                        {platform}
                      </span>
                      {status === "processing" && (
                        <span
                          className="spinner-border spinner-border-sm"
                          role="status"
                          style={{
                            width: "0.8em",
                            height: "0.8em",
                            borderWidth: "2px",
                            marginLeft: "4px",
                          }}
                        ></span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* VARIANT STRATEGY BADGE */}
            {item.variants && item.variants.length > 0 && (
              <div
                style={{
                  margin: "4px 0",
                  padding: "8px 12px",
                  background: "#1e1e2e",
                  borderRadius: 8,
                  border: "1px solid #444",
                  display: "inline-block",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ marginRight: 6, fontWeight: 700, color: "#fff" }}>
                    {item.variant_strategy === "bandit"
                      ? "🎰 AI Bandit Strategy"
                      : "🔄 Rotation Strategy"}
                  </span>
                  <span style={{ color: "#aaa", fontSize: "0.9em" }}>
                    • {item.variants.length} Variants Active
                  </span>
                  {item.variant_strategy === "bandit" && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#10b981",
                        fontSize: "0.8em",
                        background: "rgba(16, 185, 129, 0.1)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      ● Live Optimization
                    </span>
                  )}
                </div>

                {/* LIVE STATS DISPLAY */}
                {item.stats && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 8,
                      marginTop: 8,
                      borderTop: "1px solid #333",
                      paddingTop: 8,
                    }}
                  >
                    <div>
                      <div style={{ color: "#aaa", fontSize: "0.75rem" }}>👀 TOTAL VIEWS</div>
                      <div style={{ color: "#fff", fontWeight: 700 }}>
                        {item.stats.totalImpressions?.toLocaleString() || 0}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#aaa", fontSize: "0.75rem" }}>👆 CLICKS (CTR)</div>
                      <div style={{ color: "#fff", fontWeight: 700 }}>
                        {item.stats.totalClicks || 0}{" "}
                        <span style={{ fontSize: "0.8em", color: "#888" }}>
                          ({item.stats.ctr || "0%"})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#aaa", fontSize: "0.75rem" }}>🏆 TOP WINNER</div>
                      <div
                        style={{
                          color: "#fbbf24",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 150,
                        }}
                        title={item.stats.winningVariant}
                      >
                        {item.stats.winningVariant || "Analyzing..."}
                      </div>
                    </div>
                  </div>
                )}

                {/* AI COACH INSIGHTS */}
                {item.insights && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed #444",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: item.insights.color }}>
                      {item.insights.message}
                    </div>
                    {item.insights.suggestion && (
                      <div style={{ marginTop: 2, color: "#ccc", fontStyle: "italic" }}>
                        💡 Tip: {item.insights.suggestion}
                      </div>
                    )}
                    {item.insights.alert && (
                      <div style={{ marginTop: 4, color: "#f87171", fontSize: "0.8rem" }}>
                        {item.insights.alert}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <br />
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                View {item.type}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ContentList;
