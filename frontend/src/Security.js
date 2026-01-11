import React from "react";
import "./Page.css";

const Security = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Security & Compliance</h1>
      <p className="ap-page-subtitle">Your data and content safety is our top priority.</p>
    </header>

    <div className="ap-content-section">
      <h3>Data Encryption</h3>
      <p>
        All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. We
        utilize Google Cloud Platform&apos;s secure infrastructure.
      </p>

      <h3>Authentication</h3>
      <p>
        We use Firebase Authentication to handle identity management securely. We support
        Multi-Factor Authentication (MFA) to protect your account.
      </p>

      <h3>Access Control</h3>
      <p>
        Strict role-based access control (RBAC) ensures only authorized personnel can access system
        internals. We perform regular security audits.
      </p>

      <h3>Reporting Vulnerabilities</h3>
      <p>
        If you discover a security issue, please email us at{" "}
        <a href="mailto:security@autopromote.org">security@autopromote.org</a>. We offer a bug
        bounty program for valid reports.
      </p>
    </div>
  </div>
);

export default Security;
