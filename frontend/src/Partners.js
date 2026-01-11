import React from "react";
import "./Page.css";

const Partners = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Partners</h1>
      <p className="ap-page-subtitle">Working together to empower creators.</p>
    </header>

    <div className="ap-content-section">
      <h3>Technology Partners</h3>
      <p>We work closely with major platforms to ensure reliable API integrations.</p>
      <div className="ap-partners-logos">
        {/* Placeholders for logos */}
        <span>Meta</span> • <span>TikTok</span> • <span>Google Cloud</span> • <span>OpenAI</span>
      </div>

      <h3>Affiliate Program</h3>
      <p>
        Earn commissions by referring new creators to AutoPromote. Our partners get exclusive
        resources and early access to new features.
      </p>

      <button className="ap-btn-primary">Apply to Partner</button>
    </div>
  </div>
);

export default Partners;
