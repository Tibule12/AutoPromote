import React, { useState } from "react";
import "./PlatformSettingsOverride.css"; // Import the new unique styles

const PlatformSettingsOverride = ({
  selectedPlatforms = [], // Array of strings, e.g. ["youtube", "tiktok", "instagram"]
  // TikTok State
  tiktokCommercial,
  setTiktokCommercial,
  tiktokDisclosure,
  setTiktokDisclosure,
  tiktokConsentChecked,
  setTiktokConsentChecked,
  tiktokCreatorInfo,
  getTikTokDeclaration,
  // YouTube State
  youtubeSettings,
  setYoutubeSettings, // { privacy: "public", tags: [], category: "" }
  // Optional setter to persist platform-specific options upstream
  setPlatformOption,
  // Instagram State
  instagramSettings,
  setInstagramSettings, // { shareToFeed: true, location: "" }
  // Twitter State
  twitterSettings,
  setTwitterSettings, // { threadMode: false }
  // LinkedIn State
  linkedinSettings,
  setLinkedinSettings, // { postType: "post" | "article" }
  // Snapchat State
  snapchatSettings,
  setSnapchatSettings,
  // Reddit State
  redditSettings,
  setRedditSettings,
  // Pinterest State
  pinterestSettings,
  setPinterestSettings,
  // Discord State
  discordSettings,
  setDiscordSettings,
  // Telegram State
  telegramSettings,
  setTelegramSettings,
  // Spotify State
  spotifySettings,
  setSpotifySettings,
}) => {
  const [activeTab, setActiveTab] = useState(selectedPlatforms[0] || "");
  // Role states for role-driven UX per platform
  const [youtubeRole, setYoutubeRole] = useState("creator"); // 'creator'|'brand'|'sponsored'|'boosted'
  const [facebookRole, setFacebookRole] = useState("creator");

  // Update active tab if selection changes and current tab is no longer valid
  React.useEffect(() => {
    if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(activeTab)) {
      setActiveTab(selectedPlatforms[0]);
    }
  }, [selectedPlatforms, activeTab]);

  if (!selectedPlatforms || selectedPlatforms.length === 0) return null;

  const renderTikTokSettings = () => (
    <div className="platform-settings-panel tiktok-theme-panel">
      <div className="platform-header tiktok-header">
        <span className="platform-icon">🎵</span>
        <h4>Post Settings</h4>
      </div>

      <div className="tiktok-control-group">
        <label className="tiktok-toggle-row">
          <div className="tiktok-label-stack">
            <span className="tiktok-label-main">Disclose video content</span>
            <span className="tiktok-label-sub">Label as &quot;Promotional content&quot;</span>
          </div>
          <div className="tiktok-toggle-wrapper">
            <input
              type="checkbox"
              className="tiktok-toggle-input"
              checked={!!tiktokDisclosure}
              onChange={e => setTiktokDisclosure(!!e.target.checked)}
            />
            <span className="tiktok-toggle-slider"></span>
          </div>
        </label>

        {tiktokDisclosure && (
          <div className="tiktok-info-toast">⚠ This setting is permanent once posted.</div>
        )}
      </div>

      <div className="tiktok-control-group">
        <label className="tiktok-toggle-row">
          <div className="tiktok-label-stack">
            <span className="tiktok-label-main">Commercial Content</span>
            <span className="tiktok-label-sub">Enable for branded videos</span>
          </div>
          <div className="tiktok-toggle-wrapper">
            <input
              type="checkbox"
              className="tiktok-toggle-input"
              checked={!!tiktokCommercial.isCommercial}
              onChange={e =>
                setTiktokCommercial(prev => ({
                  ...prev,
                  isCommercial: e.target.checked,
                }))
              }
            />
            <span className="tiktok-toggle-slider"></span>
          </div>
        </label>

        {tiktokCommercial.isCommercial && (
          <div className="tiktok-sub-options">
            <label className="tiktok-checkbox-row">
              <input
                type="checkbox"
                className="tiktok-checkbox"
                checked={!!tiktokCommercial.yourBrand}
                onChange={e =>
                  setTiktokCommercial(prev => ({
                    ...prev,
                    yourBrand: e.target.checked,
                  }))
                }
              />
              <span>Your Brand</span>
            </label>
            <label className="tiktok-checkbox-row">
              <input
                type="checkbox"
                className="tiktok-checkbox"
                checked={!!tiktokCommercial.brandedContent}
                onChange={e =>
                  setTiktokCommercial(prev => ({
                    ...prev,
                    brandedContent: e.target.checked,
                  }))
                }
              />
              <span>Branded Content</span>
            </label>
          </div>
        )}
      </div>

      <div className="tiktok-footer-consent">
        <label className="tiktok-checkbox-row">
          <input
            type="checkbox"
            className="tiktok-checkbox"
            checked={tiktokConsentChecked}
            onChange={e => setTiktokConsentChecked(e.target.checked)}
          />{" "}
          <span style={{ fontSize: "12px", opacity: 0.8 }}>
            {getTikTokDeclaration ? getTikTokDeclaration() : "I agree to TikTok policies"}
          </span>
        </label>
      </div>
    </div>
  );

  const renderYouTubeSettings = () => (
    <div className="platform-settings-panel youtube-theme-panel">
      <div className="platform-header youtube-header">
        <span className="platform-icon">▶</span>
        <h4>Studio Details</h4>
      </div>

      {/* Role selector for YouTube (Creator / Brand / Sponsored / Boosted) */}
      <div
        style={{ marginTop: 8, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}
      >
        <label style={{ fontWeight: 700, marginRight: 8 }}>Role:</label>
        {["creator", "brand", "sponsored", "boosted"].map(r => (
          <button
            key={r}
            type="button"
            className={`role-btn ${youtubeRole === r ? "active" : ""}`}
            onClick={() => {
              setYoutubeRole(r);
              if (typeof setPlatformOption === "function") setPlatformOption("youtube", "role", r);
            }}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      <div className="youtube-card-grid">
        <div className="youtube-card">
          <label className="youtube-label">Visibility</label>
          <div className="youtube-radio-group">
            {["public", "unlisted", "private"].map(opt => (
              <label
                key={opt}
                className={`youtube-radio-item ${youtubeSettings?.privacy === opt ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="yt-privacy"
                  value={opt}
                  checked={youtubeSettings?.privacy === opt}
                  onChange={e =>
                    setYoutubeSettings({ ...youtubeSettings, privacy: e.target.value })
                  }
                />
                <span className="youtube-radio-text">
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="youtube-card">
          <label className="youtube-label">Format Override</label>
          <select
            className="youtube-select-material"
            value={youtubeSettings?.typeOverride || "auto"}
            onChange={e => setYoutubeSettings({ ...youtubeSettings, typeOverride: e.target.value })}
          >
            <option value="auto">Auto (Detect)</option>
            <option value="shorts">YouTube Shorts 📱</option>
            <option value="video">Regular Video 📺</option>
          </select>
        </div>

        <div className="youtube-card full-width">
          <label className="youtube-label">Tags</label>
          <div className="youtube-tags-input-wrapper">
            <span className="youtube-input-icon">#</span>
            <input
              className="youtube-input-material"
              placeholder="Add tags separated by comma..."
              value={youtubeSettings?.tags || ""}
              onChange={e => setYoutubeSettings({ ...youtubeSettings, tags: e.target.value })}
            />
          </div>
        </div>

        {/* Role-specific fields */}
        {youtubeRole === "sponsored" && (
          <div style={{ marginTop: 12 }} className="youtube-card full-width">
            <label className="youtube-label">Sponsor name</label>
            <input
              placeholder="Sponsor name"
              className="youtube-input-material"
              onChange={e => {
                if (typeof setPlatformOption === "function")
                  setPlatformOption("youtube", "sponsor", e.target.value);
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              This will be included in the paid promotion disclosure.
            </div>
          </div>
        )}

        {youtubeRole === "boosted" && (
          <div style={{ marginTop: 12 }} className="youtube-card full-width">
            <label className="youtube-label">Boost Budget (USD)</label>
            <input
              placeholder="e.g., 25"
              type="number"
              min="0"
              className="youtube-input-material"
              onChange={e => {
                if (typeof setPlatformOption === "function")
                  setPlatformOption("youtube", "boostBudget", Number(e.target.value));
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Set a budget to run a paid boost for this upload (optional).
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderInstagramSettings = platformVariant => {
    const isFb = platformVariant === "facebook";
    const themeClass = isFb ? "facebook-theme-panel" : "instagram-theme-panel";
    const headerClass = isFb ? "facebook-header" : "instagram-header";
    const icon = isFb ? "🟦" : "📸";
    const title = isFb ? "Create Post" : "New Post";

    return (
      <div className={`platform-settings-panel ${themeClass}`}>
        <div className={`platform-header ${headerClass}`}>
          <span className="platform-icon">{icon}</span>
          <h4>{title}</h4>
        </div>

        {/* If this is Facebook show role selector (Creator/Brand/Sponsored/Boosted) */}
        {isFb && (
          <div
            style={{
              marginTop: 8,
              marginBottom: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <label style={{ fontWeight: 700, marginRight: 8 }}>Role:</label>
            {["creator", "brand", "sponsored", "boosted"].map(r => (
              <button
                key={r}
                type="button"
                className={`role-btn ${facebookRole === r ? "active" : ""}`}
                onClick={() => {
                  setFacebookRole(r);
                  if (typeof setPlatformOption === "function")
                    setPlatformOption("facebook", "role", r);
                }}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        )}

        <div className="instagram-list-group">
          <div className="instagram-list-item">
            <div className="instagram-label-stack">
              <span className="instagram-text-main">Share to Feed</span>
              <span className="instagram-text-sub">Also post to grid profile</span>
            </div>
            <div className="instagram-toggle-outer">
              <input
                type="checkbox"
                className="instagram-toggle-checkbox"
                checked={instagramSettings?.shareToFeed ?? true}
                onChange={e =>
                  setInstagramSettings({
                    ...instagramSettings,
                    shareToFeed: e.target.checked,
                  })
                }
              />
              <div className="instagram-toggle-track"></div>
            </div>
          </div>

          <div className="instagram-list-item">
            <div className="instagram-label-stack">
              <span className="instagram-text-main">Add Location</span>
            </div>
            <div className="instagram-input-wrapper">
              <span className="instagram-pin-icon">📍</span>
              <input
                className="instagram-clean-input"
                placeholder="Search location..."
                value={instagramSettings?.location || ""}
                onChange={e =>
                  setInstagramSettings({ ...instagramSettings, location: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        {/* Facebook/Sponsored or Boosted extras (only when viewing Facebook variant) */}
        {isFb && facebookRole === "sponsored" && (
          <div style={{ padding: 12, borderTop: "1px solid #eef2f7", marginTop: 12 }}>
            <label style={{ fontWeight: 700 }}>Sponsor name</label>
            <input
              placeholder="Sponsor name"
              className="instagram-clean-input"
              onChange={e => {
                if (typeof setPlatformOption === "function")
                  setPlatformOption("facebook", "sponsor", e.target.value);
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              This will be shown in any sponsor disclosure.
            </div>
          </div>
        )}

        {isFb && facebookRole === "boosted" && (
          <div style={{ padding: 12, borderTop: "1px solid #eef2f7", marginTop: 12 }}>
            <label style={{ fontWeight: 700 }}>Boost Budget (USD)</label>
            <input
              placeholder="e.g., 50"
              type="number"
              min="0"
              className="instagram-clean-input"
              onChange={e => {
                if (typeof setPlatformOption === "function")
                  setPlatformOption("facebook", "boostBudget", Number(e.target.value));
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Set a budget to promote this post on Facebook.
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTwitterSettings = () => (
    <div className="platform-settings-panel twitter-theme-panel">
      <div className="platform-header twitter-header">
        <span className="platform-icon">🐦</span>
        <h4>Compose</h4>
      </div>

      <div className="twitter-card">
        <div className="twitter-user-row">
          <div className="twitter-avatar-mock"></div>
          <div className="twitter-vertical-line"></div>
        </div>
        <div className="twitter-content-area">
          <label className="twitter-thread-option">
            <div className="twitter-text-info">
              <span className="twitter-bold">Thread Mode</span>
              <span className="twitter-faint">Auto-split long texts into replies</span>
            </div>
            <input
              type="checkbox"
              className="twitter-switch"
              checked={twitterSettings?.threadMode || false}
              onChange={e =>
                setTwitterSettings({ ...twitterSettings, threadMode: e.target.checked })
              }
            />
          </label>
        </div>
      </div>
    </div>
  );

  const renderLinkedInSettings = () => (
    <div className="platform-settings-panel linkedin-theme-panel">
      <div className="platform-header linkedin-header">
        <span className="platform-icon">💼</span>
        <h4>Create a post</h4>
      </div>

      <div className="linkedin-controls">
        <label className="linkedin-block-label">Format</label>
        <div className="linkedin-segment-control">
          <button
            type="button"
            className={`linkedin-segment-btn ${linkedinSettings?.postType !== "article" ? "active" : ""}`}
            onClick={() => setLinkedinSettings({ ...linkedinSettings, postType: "post" })}
          >
            📝 Text / Media
          </button>
          <button
            type="button"
            className={`linkedin-segment-btn ${linkedinSettings?.postType === "article" ? "active" : ""}`}
            onClick={() => setLinkedinSettings({ ...linkedinSettings, postType: "article" })}
          >
            📄 Article
          </button>
        </div>
      </div>
    </div>
  );

  const renderSnapchatSettings = () => (
    <div className="platform-settings-panel snapchat-theme-panel">
      <div className="snapchat-ghost-bg"></div>
      <div className="platform-header snapchat-header">
        <h4>Send To...</h4>
      </div>

      <div className="snapchat-selection-grid">
        <label
          className={`snapchat-option-card ${snapchatSettings?.placement === "story" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="snap-placement"
            value="story"
            checked={snapchatSettings?.placement === "story"}
            onChange={e => setSnapchatSettings({ ...snapchatSettings, placement: e.target.value })}
          />
          <div className="snapchat-card-content">
            <span className="snapchat-emoji">📖</span>
            <span className="snapchat-label">My Story</span>
          </div>
        </label>

        <label
          className={`snapchat-option-card ${snapchatSettings?.placement === "spotlight" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="snap-placement"
            value="spotlight"
            checked={snapchatSettings?.placement === "spotlight"}
            onChange={e => setSnapchatSettings({ ...snapchatSettings, placement: e.target.value })}
          />
          <div className="snapchat-card-content">
            <span className="snapchat-emoji">🔦</span>
            <span className="snapchat-label">Spotlight</span>
          </div>
        </label>

        <label
          className={`snapchat-option-card ${snapchatSettings?.placement === "both" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="snap-placement"
            value="both"
            checked={snapchatSettings?.placement === "both"}
            onChange={e => setSnapchatSettings({ ...snapchatSettings, placement: e.target.value })}
          />
          <div className="snapchat-card-content">
            <span className="snapchat-emoji">🚀</span>
            <span className="snapchat-label">Both</span>
          </div>
        </label>
      </div>
    </div>
  );

  const renderRedditSettings = () => (
    <div className="platform-settings-panel reddit-theme-panel">
      <div className="platform-header reddit-header">
        <span className="platform-icon">🤖</span>
        <h4>Post Settings</h4>
      </div>

      <div className="reddit-form-group">
        <label className="reddit-label">ADD FLAIR</label>
        <div className="reddit-flair-input-wrapper">
          <span className="reddit-tag-icon">🏷️</span>
          <input
            className="reddit-flair-input"
            placeholder="Search for flair..."
            value={redditSettings?.flair || ""}
            onChange={e => setRedditSettings({ ...redditSettings, flair: e.target.value })}
          />
        </div>
      </div>

      <div className="reddit-toggles-container">
        <label className={`reddit-toggle-btn ${redditSettings?.nsfw ? "active-nsfw" : ""}`}>
          <input
            type="checkbox"
            style={{ display: "none" }}
            checked={redditSettings?.nsfw || false}
            onChange={e => setRedditSettings({ ...redditSettings, nsfw: e.target.checked })}
          />
          <span className="reddit-toggle-label">🔞 NSFW</span>
          <span className="reddit-plus-icon">{redditSettings?.nsfw ? "✓" : "+"}</span>
        </label>

        <label className="reddit-toggle-btn">
          {/* Placeholder for spoiler */}
          <span className="reddit-toggle-label">⚠️ Spoiler</span>
          <span className="reddit-plus-icon">+</span>
        </label>
      </div>
    </div>
  );

  const renderPinterestSettings = () => (
    <div className="platform-settings-panel pinterest-theme-panel">
      <div className="platform-header pinterest-header">
        <span className="platform-icon">📌</span>
        <h4>Save to...</h4>
      </div>

      {/* Visual Board Selector */}
      <div className="form-group">
        <label className="pinterest-sublabel">Board</label>
        <div className="pinterest-board-scroller">
          {/* Mock board cards for visual feel */}
          <div className="pinterest-board-card selected">
            <div className="board-preview" style={{ background: "#e60023" }}></div>
            <span>Viral</span>
          </div>
          <div className="pinterest-board-card">
            <div className="board-preview" style={{ background: "#333" }}></div>
            <span>Lifestyle</span>
          </div>
          <div className="pinterest-board-card create-new">
            <div className="board-preview">+</div>
            <span>Create</span>
          </div>
        </div>
      </div>

      <div className="form-group pinterest-card-layout">
        <div className="pinterest-input-group">
          <label className="pinterest-sublabel">Destination Website</label>
          <div className="pinterest-pill-input-wrapper">
            <span className="pinterest-link-icon">🔗</span>
            <input
              className="pinterest-pill-input"
              placeholder="Add a link"
              value={pinterestSettings?.linkUrl || ""}
              onChange={e =>
                setPinterestSettings({ ...pinterestSettings, linkUrl: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      <div className="pinterest-tip-bubble">
        💡 <strong>Tip:</strong> Vertical images (2:3) stand out here.
      </div>
    </div>
  );

  const renderDiscordSettings = () => (
    <div className="platform-settings-panel discord-theme-panel">
      <div className="platform-header discord-header">
        <span className="platform-icon">🎮</span>
        <h4>Server Push</h4>
      </div>

      <div className="discord-dark-box">
        <label className="discord-label">MENTION ROLES</label>
        <div className="discord-radio-stack">
          {["none", "here", "everyone"].map(opt => (
            <label key={opt} className="discord-radio-row">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="radio"
                  className="discord-radio"
                  name="discord-notify"
                  value={opt}
                  checked={discordSettings?.notify === opt}
                  onChange={e => setDiscordSettings({ ...discordSettings, notify: e.target.value })}
                />
                <span className="discord-radio-text">
                  {opt === "none" ? "No pings" : `@${opt}`}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTelegramSettings = () => (
    <div className="platform-settings-panel telegram-theme-panel">
      <div className="platform-header telegram-header">
        <h4>Broadcast</h4>
      </div>
      <div className="telegram-bubble">
        <div className="telegram-row">
          <span className="telegram-label-text">Send without sound</span>
          <label className="telegram-switch">
            <input
              type="checkbox"
              checked={telegramSettings?.silent || false}
              onChange={e => setTelegramSettings({ ...telegramSettings, silent: e.target.checked })}
            />
            <span className="telegram-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderSpotifySettings = () => (
    <div className="platform-settings-panel spotify-theme-panel">
      <div className="platform-header spotify-header">
        <span className="platform-icon">🎧</span>
        <h4>New Episode</h4>
      </div>
      <div className="spotify-info-card">
        <div className="spotify-art-placeholder">🎵</div>
        <div className="spotify-text-area">
          <div className="spotify-title-line">Your Audio Upload</div>
          <div className="spotify-sub-line">Will appear in Episodes</div>
        </div>
      </div>
    </div>
  );

  const renderSettingsForPlatform = platform => {
    switch (platform) {
      case "tiktok":
        return renderTikTokSettings();
      case "youtube":
        return renderYouTubeSettings();
      case "instagram":
      case "facebook": // Usually shares logic
        return renderInstagramSettings(platform);
      case "twitter":
        return renderTwitterSettings();
      case "linkedin":
        return renderLinkedInSettings();
      case "snapchat":
        return renderSnapchatSettings();
      case "reddit":
        return renderRedditSettings();
      case "pinterest":
        return renderPinterestSettings();
      case "discord":
        return renderDiscordSettings();
      case "telegram":
        return renderTelegramSettings();
      case "spotify":
        return renderSpotifySettings();
      default:
        return <div className="platform-settings-panel">No extra settings for {platform}.</div>;
    }
  };

  return (
    <div className="platform-overrides-container">
      <div className="platform-overrides-title">
        <span>⚙️</span> Platform Specific Settings
      </div>

      <div className="platform-tabs">
        {selectedPlatforms.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setActiveTab(p)}
            className={`platform-tab-btn ${p} ${activeTab === p ? "active" : ""}`}
          >
            {/* You could add logos here if available */}
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className={`platform-tab-content platform-theme-${activeTab}`}>
        {renderSettingsForPlatform(activeTab)}
      </div>
    </div>
  );
};

export default PlatformSettingsOverride;
