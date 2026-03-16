import React from "react";
import "./Page.css";
import PublicFeatureAvailability from "./components/PublicFeatureAvailability";

const Features = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Platform Features</h1>
      <p className="ap-page-subtitle">A practical publishing stack for connected creators and teams.</p>
    </header>

    <div className="ap-features-grid">
      <div className="ap-feature-card">
        <h3>🚀 Publishing Queue & Scheduling</h3>
        <p>
          Queue content for the platforms you select, schedule future releases, and monitor publish
          status from one place. Actual availability depends on your connected accounts and enabled
          platform integrations.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>🛡️ Compliance & Content Checks</h3>
        <p>
          AutoPromote checks upload metadata and platform-specific disclosure requirements before
          content is sent into the publishing flow.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>🎯 Mission Board</h3>
        <p>
          Track your publishing activity, queue state, and performance signals across all connected platforms.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>📊 Advanced Analytics</h3>
        <p>
          Unified dashboard for publish state, engagement signals, and available performance data
          across linked content and platform records.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>✂️ Editing, Clips & Smart Formatting</h3>
        <p>
          Use the editor and clip tools to trim, preview, and prepare media for vertical and
          platform-specific formats like Shorts, Reels, and TikTok.
        </p>
      </div>
      <div className="ap-feature-card">
        <h3>🔗 Short Links & Landing Infrastructure</h3>
        <p>
          Trackable short-link and landing-page infrastructure exists in the platform, with
          availability depending on deployment and routing configuration.
        </p>
      </div>
    </div>

    <PublicFeatureAvailability
      title="What To Expect In Practice"
      intro="Feature names alone can over-promise. This snapshot explains what is live, what depends on connected accounts, and what should be treated as retired or deployment-specific."
    />
  </div>
);

export default Features;
