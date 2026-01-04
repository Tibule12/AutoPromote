import React from "react";
// API_ENDPOINTS not needed here
import ExplainButton from "../components/ExplainButton";

const ConnectionsPanel = ({
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
  const getPlatformLabel = platform => {
    const summary = platformSummary?.summary || {};
    switch (platform) {
      case "twitter":
        return twitterStatus?.identity?.username
          ? `@${twitterStatus.identity.username}`
          : summary.twitter?.username
            ? `@${summary.twitter.username}`
            : twitterStatus?.identity?.name || null;
      case "tiktok":
        return tiktokStatus?.profile?.username
          ? `@${tiktokStatus.profile.username}`
          : tiktokStatus?.meta?.display_name || summary.tiktok?.display_name || null;
      case "facebook":
        return (
          facebookStatus?.profile?.name ||
          facebookStatus?.profile?.email ||
          (facebookStatus?.pages?.[0]?.name ? `Page: ${facebookStatus.pages[0].name}` : null) ||
          (facebookStatus?.meta?.pages?.[0]?.name
            ? `Page: ${facebookStatus.meta.pages[0].name}`
            : null) ||
          summary.facebook?.pages?.[0] ||
          null
        );
      case "youtube":
        return youtubeStatus?.channel?.snippet?.title || summary.youtube?.channelTitle || null;
      case "spotify":
        return (
          spotifyStatus?.profile?.display_name ||
          spotifyStatus?.meta?.display_name ||
          summary.spotify?.display_name ||
          null
        );
      case "reddit":
        return redditStatus?.profile?.username
          ? `u/${redditStatus.profile.username}`
          : redditStatus?.meta?.username
            ? `u/${redditStatus.meta.username}`
            : summary.reddit?.name
              ? `u/${summary.reddit.name}`
              : null;
      case "discord":
        return discordStatus?.profile?.username
          ? `${discordStatus.profile.username}${discordStatus.profile.discriminator ? "#" + discordStatus.profile.discriminator : ""}`
          : discordStatus?.meta?.username || summary.discord?.username || null;
      case "linkedin":
        return (
          linkedinStatus?.profile?.name ||
          linkedinStatus?.profile?.email ||
          linkedinStatus?.meta?.organizations?.[0]?.name ||
          summary.linkedin?.organizations?.[0] ||
          null
        );
      case "telegram":
        return telegramStatus?.profile?.username
          ? `@${telegramStatus.profile.username}`
          : telegramStatus?.profile?.first_name
            ? `${telegramStatus.profile.first_name}${telegramStatus.profile.last_name ? " " + telegramStatus.profile.last_name : ""}`
            : telegramStatus?.meta?.chatId || summary.telegram?.chatId || null;
      case "pinterest":
        return (
          pinterestStatus?.profile?.username ||
          (pinterestStatus?.meta?.boards?.[0]?.name
            ? `Board: ${pinterestStatus.meta.boards[0].name}`
            : null) ||
          summary.pinterest?.boards ||
          null
        );
      case "snapchat":
        return (
          snapchatStatus?.profile?.displayName ||
          snapchatStatus?.profile?.username ||
          snapchatStatus?.profile?.externalId ||
          null
        );
      default:
        return null;
    }
  };
  return (
    <section className="connections-panel">
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Connections{" "}
        <ExplainButton
          contextSummary={
            "Explain the Connections panel: shows whether each social platform is connected, how to reconnect, and common causes for disconnection (expired tokens, permission changes)."
          }
        />
      </h3>
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {twitterStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("twitter") || "Twitter connected"}
              </span>
              <button className="check-quality" onClick={handleConnectTwitter}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Twitter"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("twitter")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectTwitter}>
                Connect Twitter
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to post tweets and schedule posts.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {tiktokStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("tiktok") || "TikTok connected"}
              </span>
              <button className="check-quality" onClick={handleConnectTikTok}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect TikTok"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("tiktok")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectTikTok}>
                Connect TikTok
              </button>
              <span style={{ color: "#9aa4b2" }}>
                Connect to link your TikTok account for future posting and analytics.
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {facebookStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("facebook") || "Instagram connected"}
              </span>
              <button className="check-quality" onClick={handleConnectFacebook}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Facebook"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("facebook")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectFacebook}>
                Connect Instagram
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to manage Instagram via Facebook.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {snapchatStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("snapchat") || "Snapchat connected"}
              </span>
              <button className="check-quality" onClick={handleConnectSnapchat}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Snapchat"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("snapchat")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectSnapchat}>
                Connect Snapchat
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to post Snaps (if enabled).</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {facebookStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("facebook") || "Facebook connected"}
              </span>
              <button className="check-quality" onClick={handleConnectFacebook}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Facebook"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("facebook")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectFacebook}>
                Connect Facebook
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to manage Pages and Instagram.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {youtubeStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("youtube") || "YouTube connected"}
              </span>
              <button className="check-quality" onClick={handleConnectYouTube}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect YouTube"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("youtube")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectYouTube}>
                Connect YouTube
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to upload videos directly.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {spotifyStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("spotify") || "Spotify connected"}
              </span>
              <button className="check-quality" onClick={handleConnectSpotify}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Spotify"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("spotify")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectSpotify}>
                Connect Spotify
              </button>
              <span style={{ color: "#9aa4b2" }}>
                Connect to enable playlist sharing and analytics.
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {redditStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("reddit") || "Reddit connected"}
              </span>
              <button className="check-quality" onClick={handleConnectReddit}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Reddit"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("reddit")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectReddit}>
                Connect Reddit
              </button>
              <span style={{ color: "#9aa4b2" }}>
                Connect to cross-post to your subreddit or profile.
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {discordStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("discord") || "Discord connected"}
              </span>
              <button className="check-quality" onClick={handleConnectDiscord}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Discord"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("discord")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectDiscord}>
                Connect Discord
              </button>
              <span style={{ color: "#9aa4b2" }}>
                Connect to post to channels or get analytics.
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {linkedinStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("linkedin") || "LinkedIn connected"}
              </span>
              <button className="check-quality" onClick={handleConnectLinkedin}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect LinkedIn"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("linkedin")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectLinkedin}>
                Connect LinkedIn
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to share posts and company pages.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {telegramStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("telegram") || "Telegram connected"}
              </span>
              <button className="check-quality" onClick={handleConnectTelegram}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Telegram"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("telegram")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectTelegram}>
                Connect Telegram
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to post to channels or groups.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          {pinterestStatus?.connected ? (
            <>
              <span style={{ color: "#cbd5e1" }}>
                {getPlatformLabel("pinterest") || "Pinterest connected"}
              </span>
              <button className="check-quality" onClick={handleConnectPinterest}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Pinterest"
                  className="check-quality"
                  onClick={() => handleDisconnectPlatform("pinterest")}
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectPinterest}>
                Connect Pinterest
              </button>
              <span style={{ color: "#9aa4b2" }}>Connect to pin content and manage boards.</span>
            </>
          )}
        </div>
      </div>
      <div style={{ marginTop: ".75rem" }}>
        <h4>Aggregated Platform Summary</h4>
        <pre
          style={{
            background: "rgba(255,255,255,0.05)",
            padding: ".75rem",
            borderRadius: 8,
            maxHeight: 300,
            overflow: "auto",
          }}
        >
          {JSON.stringify(platformSummary, null, 2)}
        </pre>
      </div>
    </section>
  );
};

export default ConnectionsPanel;
