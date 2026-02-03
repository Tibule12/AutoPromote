import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css"; // Reuse existing styles or define new ones

const TikTokForm = ({
  onChange,
  initialData = {},
  creatorInfo,
  globalTitle,
  globalDescription,
}) => {
  const [privacy, setPrivacy] = useState(initialData.privacy || "PUBLIC_TO_EVERYONE");
  const [allowComments, setAllowComments] = useState(initialData.allowComments !== false);
  const [allowDuet, setAllowDuet] = useState(initialData.allowDuet !== false);
  const [allowStitch, setAllowStitch] = useState(initialData.allowStitch !== false);
  const [commercialContent, setCommercialContent] = useState(
    initialData.commercialContent || false
  );
  const [brandName, setBrandName] = useState(initialData.brandName || "");
  const [caption, setCaption] = useState(
    initialData.caption || globalTitle + " " + globalDescription
  );

  // Sync back to parent
  useEffect(() => {
    onChange({
      privacy,
      allowComments,
      allowDuet,
      allowStitch,
      commercialContent,
      brandName,
      caption,
      platform: "tiktok",
    });
  }, [privacy, allowComments, allowDuet, allowStitch, commercialContent, brandName, caption]);

  return (
    <div className="platform-form tiktok-form">
      <h4 className="platform-form-header">
        <span className="icon">🎵</span> TikTok Configuration
      </h4>

      <div className="form-group-modern">
        <label>Caption & Hashtags</label>
        <div className="input-group">
          <textarea
            className="modern-input"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Describe your video... #viral #fyp"
            maxLength={2200}
            rows={3}
          />
          <div className="char-count">{caption.length}/2200</div>
        </div>
      </div>

      <div className="form-row-modern">
        <div className="form-group-modern full-width">
          <label>Privacy Setting</label>
          <div className="segment-control">
            <button
              type="button"
              className={privacy === "PUBLIC_TO_EVERYONE" ? "active" : ""}
              onClick={() => setPrivacy("PUBLIC_TO_EVERYONE")}
            >
              Everyone
            </button>
            <button
              type="button"
              className={privacy === "MUTUAL_FOLLOW_FRIENDS" ? "active" : ""}
              onClick={() => setPrivacy("MUTUAL_FOLLOW_FRIENDS")}
            >
              Friends
            </button>
            <button
              type="button"
              className={privacy === "SELF_ONLY" ? "active" : ""}
              onClick={() => setPrivacy("SELF_ONLY")}
            >
              Private
            </button>
          </div>
        </div>
      </div>

      <div className="settings-grid">
        <div className="toggle-card">
          <label className="toggle-container">
            <input
              type="checkbox"
              checked={allowComments}
              onChange={e => setAllowComments(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
          <div className="toggle-label">
            <span>Allow Comments</span>
          </div>
        </div>
        <div className="toggle-card">
          <label className="toggle-container">
            <input
              type="checkbox"
              checked={allowDuet}
              onChange={e => setAllowDuet(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
          <div className="toggle-label">
            <span>Allow Duet</span>
          </div>
        </div>
        <div className="toggle-card">
          <label className="toggle-container">
            <input
              type="checkbox"
              checked={allowStitch}
              onChange={e => setAllowStitch(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
          <div className="toggle-label">
            <span>Allow Stitch</span>
          </div>
        </div>
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={commercialContent}
            onChange={e => setCommercialContent(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Content Disclosure (Sponsored / Ad)</span>
        </label>

        {commercialContent && (
          <div className="sub-settings fade-in">
            <label>Brand / Sponsor Name</label>
            <input
              type="text"
              className="modern-input"
              placeholder="e.g. Nike, Coca-Cola"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
            />
            <p className="legal-hint">
              Turning this on updates your video settings to comply with TikTok's Branded Content
              policies.
            </p>
          </div>
        )}
      </div>

      {creatorInfo && (
        <div className="account-status-bar">
          <small>
            Posting as: <strong>{creatorInfo.display_name || creatorInfo.open_id}</strong>
          </small>
          {creatorInfo.follower_count > 10000 && <span className="verified-badge">✓ Verified</span>}
        </div>
      )}
    </div>
  );
};

export default TikTokForm;
