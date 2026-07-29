import React from "react";
import ExplainButton from "../components/ExplainButton";
import MetaConnectionRequirementsNotice from "../components/MetaConnectionRequirementsNotice";

const PLATFORM_CONFIG = [
  {
    id: "tiktok",
    label: "TikTok",
    mark: "♪",
    helper: "Publish short-form video and collect performance data.",
  },
  {
    id: "youtube",
    label: "YouTube",
    mark: "▶",
    helper: "Upload videos and track channel performance.",
  },
  {
    id: "instagram",
    label: "Instagram",
    mark: "◎",
    helper: "Publish Reels through your connected Meta business account.",
  },
  {
    id: "facebook",
    label: "Facebook",
    mark: "f",
    helper: "Publish video and posts to the Pages you manage.",
  },
  {
    id: "twitter",
    label: "X / Twitter",
    mark: "X",
    helper: "Publish updates, media, and scheduled posts.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    mark: "in",
    helper: "Share professional posts and company updates.",
  },
  {
    id: "reddit",
    label: "Reddit",
    mark: "r/",
    helper: "Publish to your profile or approved communities.",
  },
  {
    id: "snapchat",
    label: "Snapchat",
    mark: "S",
    helper: "Publish Snaps when account access is enabled.",
  },
  {
    id: "spotify",
    label: "Spotify",
    mark: "≋",
    helper: "Use Spotify profile and playlist integrations.",
  },
  {
    id: "discord",
    label: "Discord",
    mark: "D",
    helper: "Distribute content to connected channels and webhooks.",
  },
  {
    id: "telegram",
    label: "Telegram",
    mark: "➤",
    helper: "Send releases to connected channels or groups.",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    mark: "P",
    helper: "Create pins and publish to approved boards.",
  },
];

const ConnectionsPanelRedesign = ({
  platformSummary,
  discordStatus,
  spotifyStatus,
  redditStatus,
  youtubeStatus,
  twitterStatus,
  tiktokStatus,
  facebookStatus,
  linkedinStatus,
  snapchatStatus,
  telegramStatus,
  pinterestStatus,
  handleConnectSpotify,
  handleConnectDiscord,
  handleConnectReddit,
  handleConnectYouTube,
  handleConnectTwitter,
  handleConnectSnapchat,
  handleConnectLinkedin,
  handleConnectTelegram,
  handleConnectPinterest,
  handleConnectTikTok,
  handleConnectFacebook,
  handleDisconnectPlatform,
}) => {
  const statuses = {
    discord: discordStatus,
    spotify: spotifyStatus,
    reddit: redditStatus,
    youtube: youtubeStatus,
    twitter: twitterStatus,
    tiktok: tiktokStatus,
    facebook: facebookStatus,
    instagram: {
      connected: Boolean(facebookStatus?.ig_business_account_id),
      profile: facebookStatus?.profile,
    },
    linkedin: linkedinStatus,
    snapchat: snapchatStatus,
    telegram: telegramStatus,
    pinterest: pinterestStatus,
  };

  const connectHandlers = {
    discord: handleConnectDiscord,
    spotify: handleConnectSpotify,
    reddit: handleConnectReddit,
    youtube: handleConnectYouTube,
    twitter: handleConnectTwitter,
    tiktok: handleConnectTikTok,
    facebook: handleConnectFacebook,
    instagram: handleConnectFacebook,
    linkedin: handleConnectLinkedin,
    snapchat: handleConnectSnapchat,
    telegram: handleConnectTelegram,
    pinterest: handleConnectPinterest,
  };

  const isConnected = platformId => {
    const status = statuses[platformId];
    return status === true || Boolean(status?.connected);
  };

  const connectedCount = PLATFORM_CONFIG.filter(platform => isConnected(platform.id)).length;

  const getIdentity = platformId => {
    const status = statuses[platformId] || {};
    const summary = platformSummary?.summary?.[platformId] || {};

    return (
      status?.identity?.username ||
      status?.display_name ||
      status?.profile?.username ||
      status?.profile?.displayName ||
      status?.profile?.name ||
      status?.profile?.email ||
      status?.channel?.snippet?.title ||
      status?.meta?.display_name ||
      status?.meta?.username ||
      summary?.display_name ||
      summary?.username ||
      summary?.channelTitle ||
      null
    );
  };

  const getReadiness = platformId => {
    if (!isConnected(platformId)) return "Not connected";
    if (platformId === "tiktok" && !tiktokStatus?.publishReady) return "Reconnect for publishing";
    return "Connected";
  };

  return (
    <section className="connections-panel connections-redesign">
      <div className="connections-control-banner">
        <span className="connections-control-icon">▣</span>
        <div>
          <strong>You stay in control</strong>
          <small>
            Disconnect any account at any time. AutoPromote only requests permissions needed for
            enabled features.
          </small>
        </div>
        <div className="connections-strength">
          <span>
            {connectedCount}/{PLATFORM_CONFIG.length} connected
          </span>
          <i>
            <b style={{ width: `${(connectedCount / PLATFORM_CONFIG.length) * 100}%` }} />
          </i>
        </div>
        <ExplainButton contextSummary="Explain how AutoPromote platform connections, reconnects, publishing permissions, and disconnects work." />
      </div>

      <div className="connections-section-heading">
        <div>
          <span>Publishing platforms</span>
          <h3>Choose where AutoPromote can publish</h3>
        </div>
      </div>

      <div className="connections-platform-grid">
        {PLATFORM_CONFIG.map(platform => {
          const connected = isConnected(platform.id);
          const disconnectId = platform.id === "instagram" ? "facebook" : platform.id;
          const identity = getIdentity(platform.id);

          return (
            <article
              key={platform.id}
              className={`connection-platform-card ${connected ? "is-connected" : ""}`}
            >
              <span className={`connection-platform-mark mark-${platform.id}`}>
                {platform.mark}
              </span>
              <div className="connection-platform-copy">
                <div>
                  <strong>{platform.label}</strong>
                  <span className={connected ? "status-connected" : ""}>
                    {getReadiness(platform.id)}
                  </span>
                </div>
                <small>{identity || platform.helper}</small>
              </div>
              <div className="connection-platform-actions">
                <button
                  type="button"
                  className={connected ? "btn-secondary" : "check-quality"}
                  onClick={connectHandlers[platform.id]}
                >
                  {connected ? "Manage" : `Connect ${platform.label}`}
                </button>
                {connected && handleDisconnectPlatform && (
                  <button
                    type="button"
                    className="connection-disconnect"
                    onClick={() => handleDisconnectPlatform(disconnectId)}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <details className="connections-advanced">
        <summary>
          <span>
            <strong>Connection requirements and diagnostics</strong>
            <small>Review Meta requirements and the raw connection summary.</small>
          </span>
          <span>Open details</span>
        </summary>
        <div>
          <MetaConnectionRequirementsNotice
            compact
            title="Meta publishing requirements"
            facebookStatus={facebookStatus}
          />
          {twitterStatus?.oauth1_missing && (
            <div className="connection-warning">
              <strong>X video uploads need OAuth1</strong>
              <small>Reconnect X and approve the media-upload permissions before publishing.</small>
              <button type="button" className="check-quality" onClick={handleConnectTwitter}>
                Reconnect X
              </button>
            </div>
          )}
          <pre>{JSON.stringify(platformSummary, null, 2)}</pre>
        </div>
      </details>
    </section>
  );
};

export default ConnectionsPanelRedesign;
