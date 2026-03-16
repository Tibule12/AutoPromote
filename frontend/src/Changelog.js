import React from "react";
import "./Page.css";

const Changelog = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Changelog</h1>
      <p className="ap-page-subtitle">Latest updates and improvements to AutoPromote.</p>
    </header>

    <div className="ap-changelog-item">
      <h3>v1.2.0 - Content Safety & Monetization Transition</h3>
      <span className="ap-date">January 2026</span>
      <ul>
        <li>
          Expanded <strong>content safety and compliance checks</strong> to reduce avoidable policy
          issues before publishing.
        </li>
        <li>
          Began the shift away from legacy view-based bonus messaging toward the current
          mission-driven earning model.
        </li>
        <li>Enhanced footer with better navigation and resource links.</li>
      </ul>
    </div>

    <div className="ap-changelog-item">
      <h3>v1.1.0 - Multi-Platform Expansion</h3>
      <span className="ap-date">December 2025</span>
      <ul>
        <li>Added support for Spotify, Snapchat, and Pinterest integrations.</li>
        <li>Improved video transcoding pipeline for faster uploads.</li>
        <li>Refined user dashboard UI for better accessibility.</li>
      </ul>
    </div>

    <div className="ap-changelog-item">
      <h3>v1.0.0 - Initial Launch</h3>
      <span className="ap-date">November 2025</span>
      <ul>
        <li>Core scheduling and auto-promotion engine.</li>
        <li>Basic analytics and user management.</li>
      </ul>
    </div>
  </div>
);

export default Changelog;
