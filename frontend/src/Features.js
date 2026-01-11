import React from "react";
import "./Page.css";

const Features = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Platform Features</h1>
      <p className="ap-page-subtitle">Everything you need to grow your audience automatically.</p>
    </header>

    <div className="ap-features-grid">
      <div className="ap-feature-card">
        <h3>🚀 Automated Promotion</h3>
        <p>
          Schedule and auto-post your content to TikTok, YouTube, Instagram, Twitter, LinkedIn, and
          more. Set it and forget it.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>🛡️ Content Safety Checks</h3>
        <p>
          Built-in AI moderation ensures your uploads are safe, compliant, and ready for
          monetization before they go live.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>💰 Viral Bonus & Monetization</h3>
        <p>
          Earn rewards based on your content&apos;s performance. Our viral bonus system pays you as
          you grow.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>📊 Advanced Analytics</h3>
        <p>
          Unified dashboard for all your social stats. Track views, engagement, and revenue in one
          place.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>✂️ Smart Formatting</h3>
        <p>
          Auto-resize and format your videos for specific platforms (Shorts, Reels, TikTok)
          dynamically.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>🔗 Smart Links</h3>
        <p>
          Generate tracked, monetized landing pages for your bio links to convert traffic
          effectively.
        </p>
      </div>
    </div>
  </div>
);

export default Features;
