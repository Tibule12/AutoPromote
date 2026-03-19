import React from "react";

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
  paypalEmail,
  setPaypalEmail,
  toggleDefaultPlatform,
  setDefaultsFrequency,
  setTz,
  autoRepostEnabled,
  setAutoRepostEnabled,
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
  return (
    <section className="profile-details">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3>Workspace Overview</h3>
        <button
          onClick={() => onNavigate && onNavigate("billing")}
          style={{
            padding: "8px 16px",
            fontSize: "0.9rem",
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          💳 Billing & Plans
        </button>
      </div>
      <p style={{ color: "#9aa4b2", marginTop: 0, marginBottom: "1rem", maxWidth: 640 }}>
        Billing controls the paid publishing capacity of your workspace: upload limits, connected
        platform reach, analytics depth, and support level.
      </p>
      <div className="landing-preview">
        <img
          className="landing-thumbnail"
          src={user?.thumbnailUrl || DEFAULT_IMAGE}
          alt="Landing Thumbnail"
          referrerPolicy="no-referrer"
        />
        <div style={{ color: "#9aa4b2", marginTop: ".5rem" }}>
          Welcome back, {user?.name || "User"}.
        </div>
      </div>
      <div className="performance-summary">
        <div>
          <strong>Views:</strong> {stats?.views ?? 0}
        </div>
        <div>
          <strong>Clicks:</strong> {stats?.clicks ?? 0}
        </div>
        <div>
          <strong>CTR:</strong> {stats?.ctr ?? 0}%
        </div>
      </div>

      <div className="platform-connections" style={{ marginTop: "1rem" }}>
        <h4>Platform Connections</h4>
        {/* Render all supported connections dynamically */}
        <div style={{ display: "grid", gap: ".5rem" }}>
          {[
            "tiktok",
            "facebook",
            "youtube",
            "twitter",
            "snapchat",
            "spotify",
            "reddit",
            "discord",
            "linkedin",
            "telegram",
            "pinterest",
          ].map(p => {
            const status =
              {
                tiktok: tiktokStatus,
                facebook: facebookStatus,
                youtube: youtubeStatus,
                twitter: twitterStatus,
                snapchat: snapchatStatus,
                spotify: spotifyStatus,
                reddit: redditStatus,
                discord: discordStatus,
                linkedin: linkedinStatus,
                telegram: telegramStatus,
                pinterest: pinterestStatus,
              }[p] || {};
            const handler = {
              tiktok: handleConnectTikTok,
              facebook: handleConnectFacebook,
              youtube: handleConnectYouTube,
              twitter: handleConnectTwitter,
              snapchat: handleConnectSnapchat,
              spotify: handleConnectSpotify,
              reddit: handleConnectReddit,
              discord: handleConnectDiscord,
              linkedin: handleConnectLinkedin,
              telegram: handleConnectTelegram,
              pinterest: handleConnectPinterest,
            }[p];
            const label = p.charAt(0).toUpperCase() + p.slice(1);
            const helper =
              {
                tiktok: "Connect to link your TikTok account for future posting and analytics.",
                facebook: "Connect to manage Pages and Instagram.",
                youtube: "Connect to upload videos directly.",
                twitter: "Connect to post tweets and schedule posts.",
                snapchat: "Connect to post Snaps (if enabled).",
                spotify: "Connect to manage Spotify tracks and playlists.",
                reddit: "Connect to post to subreddits.",
                discord: "Connect to manage Discord channels/webhooks.",
                linkedin: "Connect to post to LinkedIn.",
                telegram: "Connect to send messages to Telegram channels.",
                pinterest: "Connect to create pins and boards.",
              }[p] || "";
            return (
              <div key={p} style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
                {status?.connected ? (
                  <>
                    <span style={{ color: "#cbd5e1" }}>{label} connected</span>
                    <button className="check-quality" onClick={handler}>
                      Reconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handler}>
                      Connect {label}
                    </button>
                    <span style={{ color: "#9aa4b2" }}>{helper}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="profile-defaults" style={{ marginTop: "1rem" }}>
        <h4>Profile Defaults</h4>
        <div style={{ display: "grid", gap: ".5rem", maxWidth: 520 }}>
          <label style={{ color: "#9aa4b2" }}>
            Timezone
            <input
              type="text"
              value={tz}
              onChange={e => setTz && setTz(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: ".25rem",
                padding: ".4rem",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)",
                color: "#eef2ff",
              }}
            />
          </label>
          <div style={{ color: "#9aa4b2" }}>Default Platforms</div>
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
            ].map(p => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={Array.isArray(defaultsPlatforms) ? defaultsPlatforms.includes(p) : false}
                  onChange={() => toggleDefaultPlatform && toggleDefaultPlatform(p)}
                />{" "}
                {p.charAt(0).toUpperCase() + p.slice(1)}
                {p === "instagram" || p === "snapchat" ? " ⏳" : " ✅"}
              </label>
            ))}
          </div>
          <label style={{ color: "#9aa4b2" }}>
            Default Frequency
            <select
              value={defaultsFrequency}
              onChange={e => setDefaultsFrequency && setDefaultsFrequency(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: ".25rem",
                background: "rgba(255,255,255,0.05)",
                color: "#eef2ff",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                padding: ".3rem .5rem",
              }}
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <div
            style={{
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 14,
              padding: "0.9rem 1rem",
              background: "rgba(15,23,42,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ color: "#eef2ff", fontWeight: 700 }}>Smart Reposts</div>
                <div style={{ color: "#9aa4b2", marginTop: ".35rem", lineHeight: 1.5 }}>
                  Re-polish and repost decaying videos with plan-based limits. Free plans get 2
                  reposts. Paid plans get a few more, but never unlimited retries.
                </div>
              </div>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".55rem",
                  color: "#e2e8f0",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRepostEnabled}
                  onChange={e => setAutoRepostEnabled && setAutoRepostEnabled(e.target.checked)}
                />
                Auto repost enabled
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button className="check-quality" onClick={handleSaveDefaults}>
              Save Defaults
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfilePanel;
