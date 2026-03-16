import React from "react";
import "./Page.css";
import PublicFeatureAvailability from "./components/PublicFeatureAvailability";

const HelpCenter = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Help Center</h1>
      <p className="ap-page-subtitle">How can we assist you today?</p>
    </header>

    <div className="ap-features-grid">
      <div className="ap-feature-card">
        <h3>Getting Started</h3>
        <p>Learn how to connect your accounts and schedule your first post.</p>
        <a href="/docs">View Guide</a>
      </div>
      <div className="ap-feature-card">
        <h3>Account & Billing</h3>
        <p>Manage your subscription, update payment methods, or change your password.</p>
      </div>
      <div className="ap-feature-card">
        <h3>Troubleshooting</h3>
        <p>Solutions for common upload errors, connection issues, or failed posts.</p>
      </div>
      <div className="ap-feature-card">
        <h3>Contact Support</h3>
        <p>Need human help? Open a ticket or email us directly.</p>
        <a href="/support">Contact Us</a>
      </div>
    </div>

    <PublicFeatureAvailability
      title="Support Scope"
      intro="The support team can help most with the parts of AutoPromote that are live today: account connections, publishing state, scheduling, analytics visibility, and current monetization guidance."
      items={[
        {
          name: "Connected publishing workflows",
          status: "Live",
          description: "Best supported for uploads, scheduling, queue state, and platform connection issues.",
        },
        {
          name: "Monetization guidance",
          status: "Live",
          description: "Support can help explain how the platform works, subscription tiers, and platform connection issues.",
        },
        {
          name: "Deployment-only features",
          status: "Deployment-dependent",
          description: "Some short-link and landing-page behavior depends on how the running environment has been configured.",
        },
      ]}
    />
  </div>
);

export default HelpCenter;
