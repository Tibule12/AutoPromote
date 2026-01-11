import React from "react";
import "./Page.css";

const Metrics = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Analytics & Metrics</h1>
      <p className="ap-page-subtitle">Data-driven insights to supercharge your growth.</p>
    </header>

    <div className="ap-content-section">
      <h3>Unified Performance Tracking</h3>
      <p>
        Stop switching tabs. View aggregated views, likes, shares, and comments from all connected
        platforms in a single dashboard.
      </p>

      <h3>Revenue Attribution</h3>
      <p>
        Understand exactly which piece of content is driving revenue. Our attribution model tracks
        user journeys from view to conversion.
      </p>

      <h3>Audience Demographics</h3>
      <p>
        (Coming Soon) Get detailed breakdowns of your audience by location, age, and interests to
        tailor your content strategy.
      </p>
    </div>
  </div>
);

export default Metrics;
