import React from "react";
import "./Page.css";

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
  </div>
);

export default HelpCenter;
