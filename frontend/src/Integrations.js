import React from "react";
import "./Page.css";

const Integrations = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Integrations</h1>
      <p className="ap-page-subtitle">Connect with your favorite tools and platforms.</p>
    </header>

    <div className="ap-content-section">
      <h3>Social Platforms</h3>
      <ul className="ap-list">
        <li>
          <strong>YouTube:</strong> Upload Shorts and long-form video capabilities.
        </li>
        <li>
          <strong>TikTok:</strong> Full integration for posting and analytics.
        </li>
        <li>
          <strong>Instagram/Facebook:</strong> Cross-posting to Reels and Stories.
        </li>
        <li>
          <strong>Twitter (X):</strong> Automated tweets and thread creation.
        </li>
        <li>
          <strong>LinkedIn:</strong> Professional updates and video sharing.
        </li>
        <li>
          <strong>Snapchat:</strong> Spotlight posting and creative kit integration.
        </li>
        <li>
          <strong>Pinterest:</strong> Pin creation and board management.
        </li>
      </ul>

      <h3>Communication & Tools</h3>
      <ul className="ap-list">
        <li>
          <strong>Discord:</strong> Webhook notifications and community updates.
        </li>
        <li>
          <strong>Telegram:</strong> Bot integration for instant alerts.
        </li>
        <li>
          <strong>Spotify:</strong> Share your music and podcasts automatically.
        </li>
        <li>
          <strong>OpenAI:</strong> Powering our content safety and AI caption generation.
        </li>
      </ul>
    </div>
  </div>
);

export default Integrations;
