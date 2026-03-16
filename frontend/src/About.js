import React from "react";
import "./Page.css";

const About = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>About AutoPromote</h1>
      <p className="ap-page-subtitle">The publishing control layer for creators running across multiple platforms.</p>
    </header>

    <div className="ap-content-section">
      <div className="ap-about-story">
        <h2>Our Story</h2>
        <p>
          Founded in 2024, AutoPromote was born from a simple frustration: creators spend more time
          managing uploads and tweaking metadata than actually creating. We realized that in a
          multi-platform world, the real bottleneck is operations.
        </p>
        <p>
          We built AutoPromote to reduce that bottleneck. By combining connected platform
          integrations, queued publishing, and AI-assisted workflow tools, we help creators manage
          one asset across several destinations without treating distribution like repetitive manual
          labor.
        </p>
      </div>

      <div className="ap-about-mission">
        <h2>Our Mission</h2>
        <p>
          To give creators and teams better publishing infrastructure: clearer platform visibility,
          safer automation, stronger workflow visibility, and feedback loops they can actually
          learn from.
        </p>
      </div>

      <div className="ap-about-values">
        <h2>Values</h2>
        <ul className="ap-list">
          <li>
            <strong>Creator First:</strong> Every feature we build starts with the question,
            &quot;Does this help the creator?&quot;
          </li>
          <li>
            <strong>Transparency:</strong> No hidden algorithms. You own your data and your audience
            relationships.
          </li>
          <li>
            <strong>Innovation:</strong> We constantly adapt to the ever-changing landscape of
            platform APIs and creator workflow pain.
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default About;
