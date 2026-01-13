import React from "react";
import toast from "react-hot-toast";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
// API_ENDPOINTS used for debug fetch
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
  // --- Network Strength Calculation ---
  const countConnected = [
    discordStatus?.connected,
    spotifyStatus?.connected,
    redditStatus?.connected,
    youtubeStatus?.connected,
    twitterStatus?.connected,
    tiktokStatus?.connected,
    facebookStatus?.connected,
    linkedinStatus?.connected,
    snapchatStatus?.connected,
    telegramStatus?.connected,
    pinterestStatus?.connected,
  ].filter(Boolean).length;

  const totalPlatforms = 11;
  const networkStrength = Math.round((countConnected / totalPlatforms) * 100);

  let strengthLabel = "Offline";
  let strengthColor = "#ef4444"; // red
  if (countConnected > 0) {
    strengthLabel = "Weak Signal";
    strengthColor = "#f59e0b";
  } // orange
  if (countConnected > 3) {
    strengthLabel = "Active Node";
    strengthColor = "#3b82f6";
  } // blue
  if (countConnected > 7) {
    strengthLabel = "Hyper-Connected";
    strengthColor = "#10b981";
  } // green

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
        return tiktokStatus?.display_name
          ? `${tiktokStatus.display_name}`
          : tiktokStatus?.profile?.username
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          Connections{" "}
          <ExplainButton
            contextSummary={
              "Explain the Connections panel: shows whether each social platform is connected, how to reconnect, and common causes for disconnection (expired tokens, permission changes)."
            }
          />
        </h3>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "0.7rem",
              color: "#64748b",
              marginBottom: "2px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Network Strength
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "80px",
                height: "6px",
                background: "#e2e8f0",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${networkStrength}%`,
                  height: "100%",
                  background: strengthColor,
                  transition: "width 1s ease",
                }}
              ></div>
            </div>
            <span style={{ color: strengthColor, fontWeight: "bold", fontSize: "0.8rem" }}>
              {strengthLabel}
            </span>
          </div>
        </div>
      </div>
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
          {facebookStatus?.ig_business_account_id ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#cbd5e1" }}>
                  {getPlatformLabel("facebook")
                    ? `IG for ${getPlatformLabel("facebook")}`
                    : "Instagram connected"}
                </span>
                {facebookStatus?.ig_business_account_id && (
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: 12,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>IG ID: {facebookStatus.ig_business_account_id}</span>
                    <button
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(
                            String(facebookStatus.ig_business_account_id)
                          );
                          // show a minimal toast without importing heavy libs here
                          try {
                            window.toastr &&
                              window.toastr.success &&
                              window.toastr.success("IG ID copied");
                          } catch (e) {}
                        } catch (e) {}
                      }}
                      style={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        padding: "4px 6px",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Copy IG ID
                    </button>
                  </div>
                )}
              </div>
              <button className="check-quality" onClick={handleConnectFacebook}>
                Reconnect
              </button>
              {handleDisconnectPlatform && (
                <button
                  aria-label="Disconnect Instagram"
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
                {facebookStatus?.connected ? "Enable Instagram" : "Connect Instagram"}
              </button>
              <span style={{ color: "#9aa4b2" }}>
                {facebookStatus?.connected
                  ? "Link your Instagram Business account to this Page."
                  : "Connect to manage Instagram via Facebook."}
              </span>
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
        {/* Show explicit list of connected Pages with IDs so reviewers can match selection -> outcome */}
        {facebookStatus?.pages &&
          Array.isArray(facebookStatus.pages) &&
          facebookStatus.pages.length > 0 && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Connected Pages</div>
              <div style={{ marginBottom: 8 }}>
                <button
                  className="check-quality"
                  onClick={async () => {
                    try {
                      const cur = auth.currentUser;
                      if (!cur) return toast.error("Not signed in");
                      const token = await cur.getIdToken(true);
                      const res = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, {
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                      });
                      if (!res.ok) {
                        toast.error(`Status fetch failed: ${res.status}`);
                        return;
                      }
                      const json = await res.json();
                      const w = window.open();
                      if (w) {
                        w.document.body.style.fontFamily = "monospace, monospace";
                        w.document.body.innerText = JSON.stringify(json, null, 2);
                      } else {
                        console.log(json);
                        toast.success("Status opened in new window or console");
                      }
                    } catch (e) {
                      console.error(e);
                      toast.error("Failed to fetch Facebook status");
                    }
                  }}
                >
                  View raw FB status
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {facebookStatus.pages.map(p => (
                  <div
                    key={p.id}
                    style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
                  >
                    <div style={{ fontWeight: 600 }}>{p.name || "(Unnamed Page)"}</div>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>(ID: {p.id})</div>
                    <button
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(String(p.id));
                          toast.success("Page ID copied");
                        } catch (e) {
                          // silent
                        }
                      }}
                      style={{
                        marginLeft: 8,
                        padding: "4px 8px",
                        fontSize: "0.8rem",
                        borderRadius: 4,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Copy ID
                    </button>
                    {p.ig_business_account_id && (
                      <div
                        style={{
                          marginLeft: 8,
                          color: "#94a3b8",
                          fontSize: "0.85rem",
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span>IG: {p.ig_business_account_id}</span>
                        <button
                          onClick={() => {
                            try {
                              navigator.clipboard.writeText(String(p.ig_business_account_id));
                              toast.success("IG ID copied");
                            } catch (e) {}
                          }}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Copy IG
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
