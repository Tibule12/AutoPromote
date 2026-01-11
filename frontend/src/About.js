import React from "react";
import "./Page.css";

const About = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>About AutoPromote</h1>
      <p className="ap-page-subtitle">Empowering creators to own their distribution.</p>
    </header>

    <div className="ap-content-section">
      <div className="ap-about-story">
        <h2>Our Story</h2>
        <p>
          Founded in 2024, AutoPromote was born from a simple frustration: creators spend more time
          managing uploads and tweaking metadata than actually creating. We realized that in a
          multi-platform world, distribution is the bottleneck.
        </p>
        <p>
          We built AutoPromote to break that bottleneck. By combining seamless API integrations with
          powerful automation and AI-driven insights, we enable creators to broadcast their voice
          across the internet with a single click.
        </p>
      </div>

      <div className="ap-about-mission">
        <h2>Our Mission</h2>
        <p>
          To democratize audience growth by providing every creator, from indie streamers to global
          brands, with the same powerful distribution infrastructure used by media giants.
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
            social media APIs and trends.
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default About;
