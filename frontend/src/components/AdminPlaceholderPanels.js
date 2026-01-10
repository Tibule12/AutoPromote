import React from "react";

export const SupportPanel = () => (
  <div style={{ padding: 20, textAlign: "center", color: "#666" }}>
    <h2>🎧 Support Panel</h2>
    <p>Support ticket management customization coming soon.</p>
  </div>
);

export const ModerationPanel = ({ dashboardData }) => (
  <div style={{ padding: 20 }}>
    <h2>🛡️ Moderation Queue</h2>
    <p>Review flagged content and user reports.</p>
    <div style={{ marginTop: 20, padding: 15, background: "#fff", borderRadius: 8 }}>
      <strong>Pending Items:</strong> 0
    </div>
  </div>
);

export const OpenAIUsagePanel = ({ dashboardData, openAIUsage }) => (
  <div style={{ padding: 20 }}>
    <h2>🤖 OpenAI Usage Metrics</h2>
    <div
      style={{
        display: "grid",
        gap: 20,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      }}
    >
      <div style={{ padding: 15, background: "#fff", borderRadius: 8 }}>
        <strong>Total Tokens (Month)</strong>
        <p style={{ fontSize: 24, margin: "10px 0" }}>{openAIUsage?.totalTokens || 0}</p>
      </div>
      <div style={{ padding: 15, background: "#fff", borderRadius: 8 }}>
        <strong>Estimated Cost</strong>
        <p style={{ fontSize: 24, margin: "10px 0" }}>${openAIUsage?.estimatedCost || "0.00"}</p>
      </div>
    </div>
  </div>
);

export const NotificationManagementPanel = () => (
  <div style={{ padding: 20 }}>
    <h2>📧 Notification Center</h2>
    <p>Send system-wide broadcasts and manage email templates.</p>
  </div>
);

export const AdsManagementPanel = () => (
  <div style={{ padding: 20 }}>
    <h2>📢 Ads Management</h2>
    <p>Manage internal ad inventory and external campaign integrations.</p>
  </div>
);
