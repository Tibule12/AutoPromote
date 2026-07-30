import React from "react";
import MetaConnectionRequirementsNotice from "../components/MetaConnectionRequirementsNotice";

const ProfilePanel = ({
  user,
  stats,
  // connection status objects
  tiktokStatus,
  facebookStatus,
  youtubeStatus,
  twitterStatus,
  snapchatStatus,
  spotifyStatus,
  redditStatus,
  discordStatus,
  linkedinStatus,
  telegramStatus,
  pinterestStatus,
  // defaults and handlers
  tz,
  defaultsPlatforms,
  defaultsFrequency,
  toggleDefaultPlatform,
  setDefaultsFrequency,
  setTz,
  handleSaveDefaults,
  // connect handlers
  handleConnectTikTok,
  handleConnectFacebook,
  handleConnectYouTube,
  handleConnectTwitter,
  handleConnectSnapchat,
  handleConnectSpotify,
  handleConnectReddit,
  handleConnectDiscord,
  handleConnectLinkedin,
  handleConnectTelegram,
  handleConnectPinterest,
  onNavigate,
}) => {
  const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ""}/image.png`;
  const connectionDefinitions = [
    {
      id: "tiktok",
      label: "TikTok",
      status: tiktokStatus,
      handler: handleConnectTikTok,
      helper: "Connect TikTok for publishing and analytics.",
    },
    {
      id: "facebook",
      label: "Facebook",
      status: facebookStatus,
      handler: handleConnectFacebook,
      helper: "Connect the account that manages your Facebook Page and Instagram business account.",
    },
    {
      id: "youtube",
      label: "YouTube",
      status: youtubeStatus,
      handler: handleConnectYouTube,
      helper: "Connect YouTube to upload videos directly.",
    },
    {
      id: "twitter",
      label: "X / Twitter",
      status: twitterStatus,
      handler: handleConnectTwitter,
      helper: "Connect X to publish and schedule posts.",
    },
    {
      id: "snapchat",
      label: "Snapchat",
      status: snapchatStatus,
      handler: handleConnectSnapchat,
      helper: "Connect Snapchat when publishing access is enabled.",
    },
    {
      id: "spotify",
      label: "Spotify",
      status: spotifyStatus,
      handler: handleConnectSpotify,
      helper: "Connect Spotify to manage tracks and playlists.",
    },
    {
      id: "reddit",
      label: "Reddit",
      status: redditStatus,
      handler: handleConnectReddit,
      helper: "Connect Reddit to publish to your communities.",
    },
    {
      id: "discord",
      label: "Discord",
      status: discordStatus,
      handler: handleConnectDiscord,
      helper: "Connect Discord channels and webhooks.",
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      status: linkedinStatus,
      handler: handleConnectLinkedin,
      helper: "Connect LinkedIn for professional publishing.",
    },
    {
      id: "telegram",
      label: "Telegram",
      status: telegramStatus,
      handler: handleConnectTelegram,
      helper: "Connect Telegram channels for distribution.",
    },
    {
      id: "pinterest",
      label: "Pinterest",
      status: pinterestStatus,
      handler: handleConnectPinterest,
      helper: "Connect Pinterest to create pins and boards.",
    },
  ];
  const connectedPlatforms = connectionDefinitions.filter(item => item.status?.connected);

  return (
    <section className="profile-details overview-dashboard">
      <section className="overview-hero">
        <div>
          <span className="overview-eyebrow">Welcome back, {user?.name || "Creator"}</span>
          <h2>Create once. Auto-edit. Publish everywhere.</h2>
          <p>
            Turn recordings into polished content and distribute them from one focused workspace.
          </p>
          <div className="overview-hero-actions">
            <button className="check-quality" onClick={() => onNavigate?.("upload")}>
              Start publishing
            </button>
            <button className="btn-secondary" onClick={() => onNavigate?.("cam_combiner")}>
              Open Cam Combiner
            </button>
          </div>
        </div>
        <div className="overview-identity-card">
          <img
            src={user?.thumbnailUrl || user?.avatarUrl || DEFAULT_IMAGE}
            alt=""
            referrerPolicy="no-referrer"
          />
          <span>
            <small>Active workspace</small>
            <strong>{user?.name || "Your workspace"}</strong>
            <em>
              {connectedPlatforms.length} connected platform
              {connectedPlatforms.length === 1 ? "" : "s"}
            </em>
          </span>
        </div>
      </section>

      <section className="overview-feature-grid" aria-label="Primary creation tools">
        <article className="overview-feature-card overview-feature-card--primary">
          <div>
            <span className="overview-tool-icon">◫</span>
            <small>Podcast production</small>
            <h3>Cam Combiner</h3>
            <p>Sync cameras and master audio, detect speakers, and prepare a clean edit.</p>
            <button className="check-quality" onClick={() => onNavigate?.("cam_combiner")}>
              Start Cam Combiner
            </button>
          </div>
          <div className="overview-timeline" aria-hidden="true">
            <span className="overview-playhead" />
            {["Camera 1", "Camera 2", "Master audio"].map((label, index) => (
              <div key={label}>
                <small>{label}</small>
                <span>
                  {Array.from({ length: 5 }).map((_, segment) => (
                    <i key={segment} className={(segment + index) % 2 ? "cool" : "warm"} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </article>

        <div className="overview-feature-stack">
          <article className="overview-feature-card">
            <span className="overview-tool-icon">✦</span>
            <div>
              <small>AI discovery</small>
              <h3>Find Viral Clips</h3>
              <p>Find strong moments inside a finished video and send them into editing.</p>
            </div>
            <button className="btn-secondary" onClick={() => onNavigate?.("find_viral_clips")}>
              Find Viral Clips
            </button>
          </article>
          <article className="overview-feature-card">
            <span className="overview-tool-icon overview-tool-icon--cyan">◇</span>
            <div>
              <small>Campaign creation</small>
              <h3>Smart Promo</h3>
              <p>Create a master edit, social previews, and campaign visuals from one source.</p>
            </div>
            <button className="btn-secondary" onClick={() => onNavigate?.("smart_promo")}>
              Open Smart Promo
            </button>
          </article>
          <article className="overview-feature-card">
            <span className="overview-tool-icon overview-tool-icon--cyan">◇</span>
            <div>
              <small>Creative studio</small>
              <h3>Idea-to-Video</h3>
              <p>Build scenes, captions, voiceover direction, and a ready-to-publish render.</p>
            </div>
            <button className="btn-secondary" onClick={() => onNavigate?.("idea_video")}>
              Open Creative Tools
            </button>
          </article>
        </div>
      </section>

      <section className="overview-workflow">
        <div className="overview-section-heading">
          <div>
            <small>Your AutoPromote workflow</small>
            <h3>From raw media to measurable results</h3>
          </div>
        </div>
        <ol>
          {[
            ["Upload", "Import recordings or a finished master."],
            ["Auto-edit", "Sync, enhance, and prepare the strongest content."],
            ["Publish", "Distribute to the channels you select."],
            ["Measure", "Track performance and improve the next release."],
          ].map(([title, copy], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="overview-lower-grid">
        <article className="overview-summary-card">
          <div className="overview-section-heading">
            <div>
              <small>Workspace performance</small>
              <h3>Publishing activity</h3>
            </div>
            <button className="btn-secondary" onClick={() => onNavigate?.("analytics")}>
              View analytics
            </button>
          </div>
          <div className="performance-summary">
            <div>
              <strong>Views</strong>
              <span>{stats?.views ?? 0}</span>
            </div>
            <div>
              <strong>Clicks</strong>
              <span>{stats?.clicks ?? 0}</span>
            </div>
            <div>
              <strong>CTR</strong>
              <span>{stats?.ctr ?? 0}%</span>
            </div>
          </div>
        </article>

        <article className="overview-summary-card">
          <div className="overview-section-heading">
            <div>
              <small>Distribution</small>
              <h3>Connected platforms</h3>
            </div>
            <button className="btn-secondary" onClick={() => onNavigate?.("connections")}>
              Manage
            </button>
          </div>
          <div className="overview-platform-summary">
            {connectionDefinitions.slice(0, 6).map(item => (
              <div key={item.id}>
                <span>{item.label.slice(0, 1)}</span>
                <strong>{item.label}</strong>
                <small className={item.status?.connected ? "is-connected" : ""}>
                  {item.status?.connected ? "Connected" : "Not connected"}
                </small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <details className="overview-settings">
        <summary>
          <span>
            <strong>Workspace defaults and connection shortcuts</strong>
            <small>Manage defaults here or use the dedicated Connections page.</small>
          </span>
          <span>Open settings</span>
        </summary>
        <div className="overview-settings-grid">
          <div className="platform-connections">
            <h4>Platform Connections</h4>
            <div>
              {connectionDefinitions.map(item => (
                <div key={item.id}>
                  <div className="overview-connection-row">
                    <span className="overview-platform-logo">{item.label.slice(0, 1)}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.status?.connected ? "Connected" : item.helper}</small>
                    </span>
                    <button className="check-quality" onClick={item.handler}>
                      {item.status?.connected ? "Reconnect" : "Connect"}
                    </button>
                  </div>
                  {item.id === "facebook" && (
                    <MetaConnectionRequirementsNotice
                      compact
                      title="Meta connection requirements"
                      facebookStatus={facebookStatus}
                      style={{ marginTop: 0 }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="profile-defaults">
            <div className="overview-section-heading">
              <div>
                <small>Publishing preferences</small>
                <h4>Profile Defaults</h4>
              </div>
              <button className="btn-secondary" onClick={() => onNavigate?.("billing")}>
                Billing & Plans
              </button>
            </div>
            <div className="overview-defaults-form">
              <label>
                Timezone
                <input type="text" value={tz} onChange={e => setTz?.(e.target.value)} />
              </label>
              <div>
                <span>Default Platforms</span>
                <div className="platform-toggles">
                  {[
                    "youtube",
                    "twitter",
                    "linkedin",
                    "discord",
                    "reddit",
                    "spotify",
                    "telegram",
                    "tiktok",
                    "facebook",
                    "instagram",
                    "snapchat",
                    "pinterest",
                  ].map(platform => (
                    <label key={platform}>
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(defaultsPlatforms)
                            ? defaultsPlatforms.includes(platform)
                            : false
                        }
                        onChange={() => toggleDefaultPlatform?.(platform)}
                      />
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <label>
                Default Frequency
                <select
                  value={defaultsFrequency}
                  onChange={e => setDefaultsFrequency?.(e.target.value)}
                >
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <button className="check-quality" onClick={handleSaveDefaults}>
                Save Defaults
              </button>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
};

export default ProfilePanel;
