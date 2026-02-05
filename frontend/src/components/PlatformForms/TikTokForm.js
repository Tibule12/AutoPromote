import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";
import EmojiPicker from "../EmojiPicker";
import HashtagSuggestions from "../HashtagSuggestions";
import { OPTIMAL_TIMES } from "../BestTimeToPost";
import FilterEffects from "../FilterEffects";

// Helper for Declaration JSX
const getTikTokDeclarationJSX = (commercialContent, brandedContent) => {
  if (!commercialContent) {
    return (
      <>
        By posting, you agree to{" "}
        <a
          href="https://www.tiktok.com/legal/music-usage-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          TikTok&apos;s Music Usage Confirmation
        </a>
        .
      </>
    );
  }
  if (brandedContent) {
    return (
      <>
        By posting, you agree to{" "}
        <a
          href="https://www.tiktok.com/community-guidelines/en/branded-content/"
          target="_blank"
          rel="noopener noreferrer"
        >
          TikTok&apos;s Branded Content Policy
        </a>{" "}
        and{" "}
        <a
          href="https://www.tiktok.com/legal/music-usage-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Music Usage Confirmation
        </a>
        .
      </>
    );
  }
  return (
    <>
      By posting, you agree to{" "}
      <a
        href="https://www.tiktok.com/legal/music-usage-policy"
        target="_blank"
        rel="noopener noreferrer"
      >
        TikTok&apos;s Music Usage Confirmation
      </a>
      .
    </>
  );
};

const TikTokForm = ({
  onChange,
  initialData = {},
  creatorInfo,
  globalTitle,
  globalDescription,
  bountyAmount,
  setBountyAmount,
  bountyNiche,
  setBountyNiche,
  protocol7Enabled,
  setProtocol7Enabled,
  protocol7Volatility,
  setProtocol7Volatility,
  type = "video",
  onFileChange,
  currentFile,
}) => {
  const [privacy, setPrivacy] = useState(initialData.privacy || "");
  const [allowComments, setAllowComments] = useState(initialData.allowComments !== false);
  const [allowDuet, setAllowDuet] = useState(initialData.allowDuet !== false);
  const [allowStitch, setAllowStitch] = useState(initialData.allowStitch !== false);

  // Advanced Disclosure Logic
  const [commercialContent, setCommercialContent] = useState(
    initialData.commercialContent || false
  );
  const [yourBrand, setYourBrand] = useState(initialData.yourBrand || false);
  const [brandedContent, setBrandedContent] = useState(initialData.brandedContent || false);
  const [aiGenerated, setAiGenerated] = useState(initialData.aiGenerated || false);
  const [consentChecked, setConsentChecked] = useState(
    initialData.consentChecked ||
      (typeof window !== "undefined" && window.__E2E_TEST_TIKTOK_CONSENT) ||
      false
  );

  const [caption, setCaption] = useState(
    initialData.caption || (globalTitle ? `${globalTitle} ${globalDescription || ""}` : "")
  );

  const [showBrandTooltip, setShowBrandTooltip] = useState(false);
  const [showBrandedTooltip, setShowBrandedTooltip] = useState(false);

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (currentFile && currentFile.type.startsWith("image/")) {
      // Only images for filters currently
      const url = URL.createObjectURL(currentFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [currentFile]);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const handleInsertEmoji = emoji => {
    setCaption(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const interactionDisabled = {
    comments: creatorInfo?.interactions?.comments === false,
    duet: creatorInfo?.interactions?.duet === false,
    stitch: creatorInfo?.interactions?.stitch === false,
  };

  useEffect(() => {
    if (brandedContent && privacy === "SELF_ONLY") {
      setPrivacy("EVERYONE");
    }
  }, [brandedContent, privacy]);

  useEffect(() => {
    onChange({
      platform: "tiktok",
      privacy,
      allowComments,
      allowDuet,
      allowStitch,
      commercialContent,
      yourBrand,
      brandedContent,
      aiGenerated,
      caption,
      consentChecked,
    });
  }, [
    privacy,
    allowComments,
    allowDuet,
    allowStitch,
    commercialContent,
    yourBrand,
    brandedContent,
    aiGenerated,
    caption,
    consentChecked,
    onChange,
  ]);

  const privacyOptions =
    creatorInfo && Array.isArray(creatorInfo.privacy_level_options)
      ? creatorInfo.privacy_level_options
      : ["EVERYONE", "FRIENDS", "SELF_ONLY"];

  return (
    <div className="platform-form tiktok-form">
      <h4 className="platform-form-header">
        <span className="icon">🎵</span> TikTok Configuration
      </h4>

      {OPTIMAL_TIMES.tiktok && (
        <div
          style={{
            fontSize: "11px",
            color: "#059669",
            marginBottom: "12px",
            padding: "8px 10px",
            backgroundColor: "#ecfdf5",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid #a7f3d0",
          }}
        >
          <span style={{ fontSize: "14px" }}>⏰</span>
          <span>
            <strong>Best time to post:</strong> {OPTIMAL_TIMES.tiktok.days.slice(0, 2).join(", ")} @{" "}
            {OPTIMAL_TIMES.tiktok.hours[0]}:00.
          </span>
        </div>
      )}

      {/* Creator Info & Posting Cap */}
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
        Creator: {creatorInfo ? creatorInfo.display_name || creatorInfo.open_id : "Not available"}
        {creatorInfo && typeof creatorInfo.posting_remaining === "number" && (
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Posting cap: {creatorInfo.posting_cap_per_24h} per 24h • Remaining:{" "}
            {creatorInfo.posting_remaining}
            {creatorInfo.posting_remaining <= 0 && (
              <div style={{ marginTop: 8, color: "#b91c1c", fontWeight: "bold" }}>
                Posting cap reached — uploading to TikTok is currently disabled for this account.
              </div>
            )}
          </div>
        )}
        {type !== "video" && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#92400e",
              background: "#fff7ed",
              padding: "8px",
              borderRadius: 6,
              border: "1px solid #fed7aa",
            }}
            role="status"
          >
            Video content is not present. TikTok-specific features (Duet / Stitch and other
            video-only options) require a video to be selected.
          </div>
        )}
      </div>

      <div className="form-group-modern">
        <label htmlFor="tiktok-caption">Caption & Hashtags</label>
        <div style={{ position: "relative" }}>
          <textarea
            id="tiktok-caption"
            className="modern-input"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Describe your video... #viral #fyp"
            maxLength={2200}
            rows={3}
          />
          <button
            type="button"
            style={{
              position: "absolute",
              right: "12px",
              top: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              opacity: 0.7,
            }}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            😊
          </button>
          {showEmojiPicker && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", right: 0 }}>
              <EmojiPicker onSelect={handleInsertEmoji} onClose={() => setShowEmojiPicker(false)} />
            </div>
          )}
        </div>
        <div className="char-count">{caption.length}/2200</div>
        <HashtagSuggestions
          contentType="video"
          title={caption}
          description=""
          onAddHashtag={tag => setCaption(prev => prev + " #" + tag)}
        />
      </div>
      <div className="form-group-modern">
        <label htmlFor="tiktok-file-input" className="form-label-bold">
          Video File
        </label>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {currentFile
            ? `Selected: ${currentFile.name}`
            : "Use global file or select unique file for TikTok"}
        </div>
        <input
          id="tiktok-file-input"
          type="file"
          accept="video/*,image/*" // TikTok supports photo mode
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
        {previewUrl && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="action-link"
              style={{
                fontSize: 13,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "#69C9D0",
                fontWeight: 600,
              }}
              onClick={() => setShowFilters(!showFilters)}
            >
              🎨 Filters (Photo Mode)
            </button>
          </div>
        )}
        {showFilters && previewUrl && (
          <div style={{ marginTop: 10 }}>
            <FilterEffects
              imageUrl={previewUrl}
              onApplyFilter={f => console.log("Filter applied:", f.name)}
            />
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <label htmlFor="tiktok-privacy" className="form-label-bold">
            Privacy (required)
          </label>
          <select
            id="tiktok-privacy"
            value={privacy}
            onChange={e => setPrivacy(e.target.value)}
            className="modern-select"
          >
            <option value="">Select privacy</option>
            {privacyOptions.map(pv => (
              <option
                key={pv}
                value={pv}
                disabled={commercialContent && brandedContent && pv === "SELF_ONLY"}
                title={
                  commercialContent && brandedContent && pv === "SELF_ONLY"
                    ? "Branded content visibility cannot be set to private."
                    : undefined
                }
              >
                {pv}
              </option>
            ))}
          </select>
          {brandedContent && privacy === "SELF_ONLY" && (
            <div style={{ fontSize: 12, color: "#b66", marginTop: 6 }}>
              Branded content cannot be private.
            </div>
          )}
        </div>

        <div>
          <label className="form-label-bold">Interactions</label>
          <div className="checkbox-group-modern">
            <label
              title={interactionDisabled.comments ? "Comments disabled by creator" : undefined}
            >
              <input
                type="checkbox"
                checked={!!allowComments}
                onChange={e => setAllowComments(e.target.checked)}
                disabled={interactionDisabled.comments}
              />{" "}
              Comments
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!allowDuet}
                onChange={e => setAllowDuet(e.target.checked)}
                disabled={interactionDisabled.duet}
              />{" "}
              Duet
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!allowStitch}
                onChange={e => setAllowStitch(e.target.checked)}
                disabled={interactionDisabled.stitch}
                title={interactionDisabled.stitch ? "Stitch disabled by creator" : undefined}
              />{" "}
              Stitch
            </label>
          </div>
        </div>

        <div>
          <label className="form-label-bold">Commercial Content Disclosure</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={commercialContent}
                onChange={e => {
                  setCommercialContent(e.target.checked);
                  if (!e.target.checked) {
                    setYourBrand(false);
                    setBrandedContent(false);
                  }
                }}
              />
              This content is commercial or promotional (This post promotes a brand, product, or
              service)
            </label>

            {bountyAmount > 0 && !commercialContent && (
              <div style={{ fontSize: "0.8rem", color: "#d97706", marginLeft: "24px" }}>
                💡 Since you set a ${bountyAmount} Bounty, considering checking this.
              </div>
            )}

            {commercialContent && (
              <div
                className="disclosure-options"
                style={{ display: "flex", gap: 12, marginLeft: 24 }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    position: "relative",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setShowBrandTooltip(true)}
                  onMouseLeave={() => setShowBrandTooltip(false)}
                >
                  <input
                    type="checkbox"
                    checked={yourBrand}
                    onChange={e => setYourBrand(e.target.checked)}
                  />
                  Your Brand
                  {showBrandTooltip && (
                    <span className="tooltip-custom">
                      You are promoting yourself or your own business. This content will be
                      classified as Brand Organic.
                    </span>
                  )}
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    position: "relative",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setShowBrandedTooltip(true)}
                  onMouseLeave={() => setShowBrandedTooltip(false)}
                >
                  <input
                    type="checkbox"
                    checked={brandedContent}
                    onChange={e => setBrandedContent(e.target.checked)}
                  />
                  Branded Content
                  {showBrandedTooltip && (
                    <span className="tooltip-custom">
                      You are promoting another brand or a third party. This content will be
                      classified as Branded Content.
                    </span>
                  )}
                </label>
              </div>
            )}

            {commercialContent && !yourBrand && !brandedContent && (
              <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
                You need to indicate if your content promotes yourself or a third party.
              </div>
            )}

            {commercialContent && (
              <div
                className="prompt"
                style={{ marginTop: 8, color: "#0f0f0f", fontWeight: 500, fontSize: "0.9rem" }}
              >
                {(yourBrand && brandedContent) || brandedContent
                  ? "Your photo/video will be labeled as 'Paid partnership'"
                  : yourBrand
                    ? "Your photo/video will be labeled as 'Promotional content'"
                    : null}
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={aiGenerated}
              onChange={e => setAiGenerated(e.target.checked)}
            />{" "}
            This content is AI-generated
          </label>
          <div style={{ fontSize: 11, color: "#666", marginTop: 4, paddingLeft: 24 }}>
            Required by TikTok for AI-created or modified content.
          </div>
        </div>

        <div className="declaration-section" style={{ fontSize: 13, marginTop: 12 }}>
          <label style={{ cursor: "pointer", display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={e => setConsentChecked(e.target.checked)}
            />{" "}
            <span style={{ lineHeight: 1.4 }}>
              {getTikTokDeclarationJSX(commercialContent, brandedContent)}
            </span>
          </label>
        </div>

        <div
          className="tiktok-behavior-summary"
          style={{
            marginTop: 10,
            background: "#f9f9f9",
            padding: 10,
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <strong style={{ fontWeight: 700, color: "#111" }}>Preview of TikTok UX behavior:</strong>
          <div style={{ marginTop: 6 }}>
            Privacy: <strong>{privacy || "Not selected"}</strong>
          </div>
          <div>
            Disclosure:{" "}
            <strong>
              {commercialContent
                ? yourBrand && brandedContent
                  ? "Your Brand + Branded"
                  : yourBrand
                    ? "Your Brand"
                    : brandedContent
                      ? "Branded Content"
                      : "Commercial"
                : "None"}
            </strong>
          </div>
        </div>

        <div className="notice-section" style={{ marginTop: 8, color: "#666", fontSize: "0.95em" }}>
          <small>
            Note: After publishing, it may take a few minutes for your content to process and be
            visible on your TikTok profile.
          </small>
        </div>

        {creatorInfo && creatorInfo.max_video_post_duration_sec && (
          <div style={{ fontSize: 12, color: "#666" }}>
            Max allowed video duration for this creator: {creatorInfo.max_video_post_duration_sec}{" "}
            seconds
          </div>
        )}
      </div>

      {setBountyAmount && (
        <div
          className="form-group-modern"
          style={{
            marginTop: "16px",
            border: "1px solid #ffd700",
            background: "rgba(255, 215, 0, 0.05)",
          }}
        >
          <label style={{ color: "#d97706", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>💰</span> Viral Bounty Pool
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "0.75rem" }}>Virtual Stake ($)</label>
              <input
                type="number"
                min="0"
                className="modern-input"
                value={bountyAmount || ""}
                onChange={e => setBountyAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem" }}>Target Niche</label>
              <select
                className="modern-select"
                value={bountyNiche || "general"}
                onChange={e => setBountyNiche && setBountyNiche(e.target.value)}
              >
                <option value="general">General</option>
                <option value="music">Music</option>
                <option value="tech">Tech</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "8px" }}>
            * This is a simulation wager. Higher values increase internal priority.
          </div>
        </div>
      )}

      {setProtocol7Enabled && (
        <div
          className="protocol-7-card"
          style={{
            marginTop: "16px",
            border: "1px solid #7c3aed",
            background: "rgba(124, 58, 237, 0.05)",
            borderRadius: "8px",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: "#6d28d9", display: "flex", alignItems: "center", gap: "6px" }}>
              🛡️ Protocol 7 (Viral Insurance)
            </strong>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={protocol7Enabled}
                onChange={e => setProtocol7Enabled(e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
            </label>
          </div>
          <p style={{ fontSize: "0.8rem", color: "#5b21b6", marginTop: "8px", lineHeight: "1.4" }}>
            If this post underperforms in the first 7 hours, AutoPromote will automatically generate
            and post optimized AI remixes to correct the engagement trajectory.
          </p>
          {protocol7Enabled && setProtocol7Volatility && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#4c1d95" }}>
                Remix Strategy
              </label>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                {["standard", "surgical", "chaos"].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProtocol7Volatility(mode)}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      borderRadius: "4px",
                      border: "1px solid",
                      cursor: "pointer",
                      backgroundColor: protocol7Volatility === mode ? "#8b5cf6" : "transparent",
                      color: protocol7Volatility === mode ? "white" : "#6d28d9",
                      borderColor: "#8b5cf6",
                      textTransform: "capitalize",
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#6d28d9", marginTop: "4px" }}>
                {protocol7Volatility === "standard"
                  ? "Balanced remixing."
                  : protocol7Volatility === "surgical"
                    ? "Metadata & title optimization only."
                    : "High-variance, divergent edits (A/B testing)."}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .tooltip-custom {
            position: absolute;
            left: 0;
            top: 110%;
            background: #222;
            color: #fff;
            padding: 6px 12px;
            borderRadius: 4px;
            fontSize: 0.95em;
            zIndex: 10;
            min-width: 180px;
        }
        .form-label-bold {
            font-weight: 600;
            display: block;
            margin-bottom: 6px;
        }
      `}</style>
    </div>
  );
};

export default TikTokForm;
