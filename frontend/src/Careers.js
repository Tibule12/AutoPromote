import React from "react";
import "./Page.css";

const Careers = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Join the Team</h1>
      <p className="ap-page-subtitle">Build the future of content distribution.</p>
    </header>

    <div className="ap-content-section">
      <div className="ap-about-story">
        <h2>Why AutoPromote?</h2>
        <p>
          We are a remote-first team passionate about empowering creators. We believe in autonomy,
          transparency, and building tools that solve real problems.
        </p>
      </div>

      <div className="ap-open-positions" style={{ marginTop: "2rem" }}>
        <h2>Open Positions</h2>
        <div className="ap-features-grid">
          <div className="ap-feature-card">
            <h3>Senior Frontend Engineer</h3>
            <p>React • Redux • TypeScript</p>
            <p>Help us build intuitive, performant interfaces for managing complex workflows.</p>
            <button className="ap-button-secondary" disabled>
              Apply Now
            </button>
          </div>
          <div className="ap-feature-card">
            <h3>Backend Engineer</h3>
            <p>Node.js • Firebase • GCP</p>
            <p>
              Scale our automation infrastructure and build robust integrations with social APIs.
            </p>
            <button className="ap-button-secondary" disabled>
              Apply Now
            </button>
          </div>
          <div className="ap-feature-card">
            <h3>Product Designer</h3>
            <p>UI/UX • Design Systems</p>
            <p>Shape the user experience across our web and mobile platforms.</p>
            <button className="ap-button-secondary" disabled>
              Apply Now
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "3rem", textAlign: "center" }}>
        <p>
          Don&apos;t see a role that fits? We&apos;re always looking for talent.
          <br />
          Send your portfolio or CV to{" "}
          <a href="mailto:careers@autopromote.com">careers@autopromote.com</a>.
        </p>
      </div>
    </div>
  </div>
);

export default Careers;
