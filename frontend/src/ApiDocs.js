import React from "react";
import "./Page.css";

const ApiDocs = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>API Reference</h1>
      <p className="ap-page-subtitle">Build on top of AutoPromote.</p>
    </header>

    <div className="ap-content-section">
      <div className="ap-alert-box">
        <strong>Note:</strong> Public API access is currently in Beta.
      </div>

      <h3>Authentication</h3>
      <p>
        All API requests require a Bearer token. Use <code>/api/auth/login</code> to retrieve a
        token.
      </p>

      <h3>Endpoints</h3>
      <ul className="ap-list">
        <li>
          <code>POST /api/content/upload</code> - Upload new media.
        </li>
        <li>
          <code>GET /api/content/my-content</code> - Retrieve uploaded items.
        </li>
        <li>
          <code>GET /api/users/me</code> - Get current user profile.
        </li>
      </ul>

      <p>
        For full documentation, please visit our{" "}
        <span style={{ textDecoration: "underline" }}>Developer Portal</span> (Coming Soon).
      </p>
    </div>
  </div>
);

export default ApiDocs;
