import React from "react";
import "./Page.css";
import PublicFeatureAvailability from "./components/PublicFeatureAvailability";

const Integrations = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Integrations</h1>
      <p className="ap-page-subtitle">Connected platforms, status-aware publishing, and workflow tools.</p>
    </header>

    <div className="ap-content-section">
      <p>
        Integration depth varies by platform, account permissions, and enabled feature flags. The
        list below reflects the integrations the product is built to work with today, not a promise
        that every connected account has identical posting rights.
      </p>

      <h3>Social Platforms</h3>
      <ul className="ap-list">
        <li>
          <strong>YouTube:</strong> Connection status, publishing flows, and channel-aware creator info.
        </li>
        <li>
          <strong>TikTok:</strong> Connection and analytics support, with posting behavior controlled by current platform access and feature flags.
        </li>
        <li>
          <strong>Instagram/Facebook:</strong> Connected publishing flows and dashboard tracking for supported account types.
        </li>
        <li>
          <strong>Twitter (X):</strong> Posting infrastructure and connected account workflows.
        </li>
        <li>
          <strong>LinkedIn:</strong> Professional post publishing and creator identity support.
        </li>
        <li>
          <strong>Snapchat:</strong> Integration hooks for supported publishing and account connection flows.
        </li>
        <li>
          <strong>Pinterest:</strong> Pin publishing and board-related workflows where credentials allow.
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
          <strong>Spotify:</strong> Music and podcast sharing support inside the publishing workflow.
        </li>
        <li>
          <strong>OpenAI:</strong> Powering captioning, workflow assistance, and selective AI features.
        </li>
      </ul>

      <PublicFeatureAvailability
        title="Integration Reality Check"
        intro="If a platform appears here, it means AutoPromote has connection or publishing infrastructure for it. It does not mean every environment or account has identical posting permissions."
        items={[
          {
            name: "Connected account status",
            status: "Live",
            description: "The dashboard can show connection status, creator identity fallbacks, and worker/system health around publishing.",
          },
          {
            name: "Direct posting rights",
            status: "Account-dependent",
            description: "Posting depth depends on the target platform, granted scopes, and whether that integration is currently enabled for your environment.",
          },
          {
            name: "Fallback or beta integrations",
            status: "Deployment-dependent",
            description: "Some platform routes exist as infrastructure or beta paths and may need environment support before they behave like fully managed production integrations.",
          },
        ]}
      />
    </div>
  </div>
);

export default Integrations;
