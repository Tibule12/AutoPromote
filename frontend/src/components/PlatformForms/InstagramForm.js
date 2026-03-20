import React, { useState, useEffect } from "react";
import EmojiPicker from "../EmojiPicker";
import HashtagSuggestions from "../HashtagSuggestions";
import { OPTIMAL_TIMES } from "../BestTimeToPost";
import FilterEffects from "../FilterEffects";
import ImageCropper from "../ImageCropper";
import { sanitizeUrl } from "../../utils/security";

const InstagramForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  facebookPages = [], // Instagram business accounts often linked to FB Pages
  instagramBusinessAccountId,
  bountyAmount,
  setBountyAmount,
  bountyNiche,
  setBountyNiche,
  protocol7Enabled,
  setProtocol7Enabled,
  protocol7Volatility,
  setProtocol7Volatility,
  onFileChange,
  currentFile,
  onReviewAI,
  onFindViralClips,
}) => {
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [caption, setCaption] = useState(
    initialData.caption || globalTitle + "\n\n" + globalDescription
  );
  const [isCaptionDirty, setIsCaptionDirty] = useState(false);

  useEffect(() => {
    if (!isTitleDirty && globalTitle && globalTitle !== title) {
      setTitle(globalTitle);
    }
  }, [globalTitle, isTitleDirty, title]);

  // Sync Global Title/Description changes UNLESS user has edited caption locally
  useEffect(() => {
    if (!isCaptionDirty && (globalTitle || globalDescription)) {
      const newCaption = `${globalTitle || ""}\n\n${globalDescription || ""}`.trim();
      if (newCaption && newCaption !== caption) {
        setCaption(newCaption);
      }
    }
  }, [globalTitle, globalDescription, isCaptionDirty]);

  const [location, setLocation] = useState(initialData.location || "");
  const [isReel, setIsReel] = useState(initialData.isReel !== false); // Default to Reel in 2026
  const [shareToFeed, setShareToFeed] = useState(initialData.shareToFeed !== false);
  // Default to first available page ID if provided, ensuring the user knows which account is target
  const [selectedPageId, setSelectedPageId] = useState(
    initialData.pageId || facebookPages[0]?.id || ""
  );

  // Auto-select first page when pages load if none selected
  useEffect(() => {
    if (!selectedPageId && facebookPages && facebookPages.length > 0) {
      setSelectedPageId(facebookPages[0].id);
    }
  }, [facebookPages, selectedPageId]);

  // Image Editing State
  const [showCrop, setShowCrop] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);

  useEffect(() => {
    if (currentFile && currentFile instanceof File) {
      const url = URL.createObjectURL(currentFile);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [currentFile]);

  useEffect(() => {
    if (currentFile && currentFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(currentFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [currentFile]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const handleInsertEmoji = emoji => {
    // Handle both object-based emoji (from EmojiPicker libraries) or string based
    const emojiChar = typeof emoji === "object" && emoji.native ? emoji.native : emoji;
    setCaption(prev => prev + emojiChar);
    setShowEmojiPicker(false);
  };

  // Branded Content / Partnership
  const [isPaidPartnership, setIsPaidPartnership] = useState(
    initialData.isPaidPartnership || false
  );
  const [sponsorUser, setSponsorUser] = useState(initialData.sponsorUser || "");

  useEffect(() => {
    // Find the page object to get a display name
    const pageObj = facebookPages?.find(p => p.id === selectedPageId);
    // Prefer IG username if available, else page name
    const username = pageObj?.instagram_business_account?.username || pageObj?.name || "";

    onChange({
      platform: "instagram",
      title,
      caption,
      location,
      isReel,
      shareToFeed,
      isPaidPartnership,
      sponsorUser,
      pageId: selectedPageId, // Include identity in payload
      username, // Pass username for preview
    });
  }, [
    title,
    caption,
    location,
    isReel,
    shareToFeed,
    isPaidPartnership,
    sponsorUser,
    selectedPageId,
    facebookPages,
  ]);

  return (
    <div className="platform-form instagram-form">
      <h4 className="platform-form-header">
        <span
          className="icon"
          style={{
            background:
              "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          📷
        </span>{" "}
        Instagram Creator
      </h4>
      {OPTIMAL_TIMES.instagram && (
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
            <strong>Best time to upload:</strong>{" "}
            {OPTIMAL_TIMES.instagram.days.slice(0, 2).join(", ")} @{" "}
            {OPTIMAL_TIMES.instagram.hours[0]}:00.
          </span>
        </div>
      )}

      {/* Scope Disclaimer / Permission Box */}
      {selectedPageId && (
        <div
          className="scope-info-box"
          style={{
            marginTop: "16px",
            marginBottom: "16px",
            padding: "12px",
            background: "#fff5f5", // Light pinkish for Instagram feel (or just generic light grey)
            borderRadius: "8px",
            border: "1px solid #ffdbdb",
            fontSize: "0.85rem",
          }}
        >
          <div
            style={{
              fontWeight: "600",
              marginBottom: "6px",
              color: "#E1306C",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🔒</span> Instagram Permissions Used
          </div>
          <p style={{ margin: 0, color: "#444", lineHeight: "1.4" }}>
            To create this post, AutoPromote uses the following Graph API permissions linked to the
            selected Facebook Page / Instagram Business account:
          </p>
          <ul style={{ margin: "6px 0 0 20px", padding: 0, color: "#444", lineHeight: "1.4" }}>
            <li>
              <code
                style={{
                  background: "#e4e6eb",
                  padding: "2px 4px",
                  borderRadius: "4px/2px",
                  fontFamily: "monospace",
                  color: "#333",
                }}
              >
                instagram_basic
              </code>
              : To identify your Instagram Business account connected to Facbeook Page{" "}
              <strong>ID: {selectedPageId}</strong>.
            </li>
            <li>
              <code
                style={{
                  background: "#e4e6eb",
                  padding: "2px 4px",
                  borderRadius: "4px/2px",
                  fontFamily: "monospace",
                  color: "#333",
                }}
              >
                instagram_content_publish
              </code>
              : Specifically used to upload the photo/video media and publish the container (Reel or
              Post) to your feed.
            </li>
          </ul>
        </div>
      )}

      <div className="form-group-modern">
        <label className="form-label-bold">Media File</label>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            {currentFile
              ? `Selected: ${currentFile.name}`
              : "Use global file or select unique file for Instagram"}
          </span>
          {currentFile && (
            <button
              type="button"
              onClick={() => onFileChange && onFileChange(null)}
              style={{
                background: "transparent",
                border: "1px solid #ef4444",
                color: "#ef4444",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          type="file"
          accept="video/*,image/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />

        {/* --- REVIEW AI ENHANCEMENTS for Instagram --- */}
        {(currentFile || !currentFile) && (onReviewAI || onFindViralClips) && (
          <div style={{ display: "flex", gap: "10px", marginTop: 8, marginBottom: 15 }}>
            {onReviewAI && (
              <button
                type="button"
                style={{
                  background:
                    "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  flex: 1,
                }}
                onClick={onReviewAI}
              >
                ✨ Review AI Enhancements
              </button>
            )}
            {onFindViralClips && (
              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  flex: 1,
                }}
                onClick={onFindViralClips}
              >
                🔥 Find Viral Clips
              </button>
            )}
          </div>
        )}

        {/* SIMPLE INLINE VIDEO PREVIEW */}
        {videoPreviewUrl && (currentFile?.type?.startsWith("video/") || !currentFile) && (
          <div style={{ marginTop: "10px" }}>
            <video
              src={sanitizeUrl(videoPreviewUrl)}
              controls
              style={{
                width: "100%",
                maxHeight: "300px",
                borderRadius: "8px",
                border: "1px solid #334155",
              }}
            />
          </div>
        )}

        {previewUrl && (
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button
              type="button"
              className="action-link"
              style={{
                fontSize: 13,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "#E1306C",
                fontWeight: 600,
              }}
              onClick={() => setShowCrop(true)}
            >
              ✂️ Crop Image
            </button>
            <button
              type="button"
              className="action-link"
              style={{
                fontSize: 13,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "#833AB4",
                fontWeight: 600,
              }}
              onClick={() => setShowFilters(!showFilters)}
            >
              🎨 Filters
            </button>
          </div>
        )}

        {showFilters && previewUrl && (
          <div style={{ marginTop: 10 }}>
            <FilterEffects
              imageUrl={sanitizeUrl(previewUrl)}
              onApplyFilter={f => console.log("Filter applied:", f.name)}
            />
          </div>
        )}

        {showCrop && previewUrl && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              zIndex: 9999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div style={{ background: "white", padding: 20, borderRadius: 8 }}>
              <ImageCropper imageUrl={sanitizeUrl(previewUrl)} onClose={() => setShowCrop(false)} />
              <button onClick={() => setShowCrop(false)} style={{ marginTop: 10 }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* IDENTITY SECTION: CRITICAL FOR REVIEWERS */}
      <div className="form-group-modern">
        <label>Publishing to Account (Identity)</label>
        {facebookPages.length > 0 ? (
          <select
            className="modern-select"
            value={selectedPageId}
            onChange={e => setSelectedPageId(e.target.value)}
          >
            {facebookPages.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{" "}
                {p.instagram_business_account
                  ? p.instagram_business_account.username
                    ? `(@${p.instagram_business_account.username})`
                    : `(IG: ${p.instagram_business_account.id})`
                  : "(Linked Page)"}
              </option>
            ))}
          </select>
        ) : instagramBusinessAccountId ? (
          <div
            className="alert-box success"
            style={{ fontSize: "0.85rem", background: "#f0fdf4", color: "#166534" }}
          >
            ✅ Direct Instagram Connection Active (ID: {instagramBusinessAccountId})
          </div>
        ) : instagramBusinessAccountId ? (
          <div
            className="alert-box success"
            style={{
              fontSize: "0.85rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
            }}
          >
            Instagram Connected via Facebook (ID: {instagramBusinessAccountId})
          </div>
        ) : (
          <div className="alert-box warning" style={{ fontSize: "0.85rem" }}>
            No connected Instagram Accounts found. Ensure your Facebook Page has an Instagram
            Business account linked.
          </div>
        )}
        <p className="legal-hint" style={{ marginTop: "4px" }}>
          <span style={{ color: "#888" }}>
            {(() => {
              const selectedPage = facebookPages.find(p => p.id === selectedPageId);
              const ig = selectedPage?.instagram_business_account;
              if (ig && ig.username) return `IG User: @${ig.username} (ID: ${ig.id})`;
              if (ig && ig.id) return `IG ID: ${ig.id}`;
              if (instagramBusinessAccountId) return `IG ID: ${instagramBusinessAccountId}`;
              return "IG ID: N/A";
            })()}
          </span>
        </p>

        <div
          className="scope-info-box"
          style={{
            marginTop: "8px",
            padding: "12px",
            background: "linear-gradient(to right, #fff0f5, #fff5f8)",
            borderRadius: "8px",
            border: "1px solid #fce7f3",
            fontSize: "0.85rem",
          }}
        >
          <div
            style={{
              fontWeight: "600",
              marginBottom: "6px",
              color: "#cc2366",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📸</span> Instagram Permissions
          </div>
          <p style={{ margin: 0, color: "#444", lineHeight: "1.4" }}>
            <strong>Why we need this:</strong>
          </p>
          <ul style={{ margin: "6px 0 0 20px", padding: 0, color: "#444", lineHeight: "1.4" }}>
            <li>
              <code
                style={{
                  background: "#fff",
                  padding: "2px 4px",
                  borderRadius: "3px",
                  border: "1px solid #fbcfe8",
                  fontFamily: "monospace",
                  color: "#be185d",
                }}
              >
                instagram_basic
              </code>
              : Used to display the Instagram account name and ID in the dropdown above, confirming
              which account you are targeting.
            </li>
            <li>
              <code
                style={{
                  background: "#fff",
                  padding: "2px 4px",
                  borderRadius: "3px",
                  border: "1px solid #fbcfe8",
                  fontFamily: "monospace",
                  color: "#be185d",
                }}
              >
                instagram_content_publish
              </code>
              : Used to securely upload your media (Reels/Photos) to the selected Professional
              Account.
            </li>
          </ul>
          <p
            style={{
              margin: "8px 0 0 0",
              color: "#831843",
              fontSize: "0.8rem",
              fontStyle: "italic",
              borderTop: "1px solid #fce7f3",
              paddingTop: "6px",
            }}
          >
            <strong>Privacy Guarantee:</strong> We cannot access your Direct Messages (DMs) or view
            your private personal profile data. We only interact with the specific business assets
            you authorize.
          </p>
        </div>
      </div>

      <div className="form-group-modern">
        <label>Title</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={e => {
            setTitle(e.target.value);
            setIsTitleDirty(true);
          }}
          placeholder="Enter an Instagram title"
          maxLength={120}
        />
      </div>

      <div className="form-group-modern">
        <label>Caption</label>
        <div style={{ position: "relative" }}>
          <textarea
            className="modern-input"
            value={caption}
            onChange={e => {
              setCaption(e.target.value);
              setIsCaptionDirty(true);
            }}
            placeholder="Write a caption..."
            rows={4}
            maxLength={2200}
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
              <EmojiPicker
                onSelect={emoji => {
                  handleInsertEmoji(emoji);
                  setIsCaptionDirty(true);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>
        <div className="char-count">{caption.length}/2200</div>
        <HashtagSuggestions
          contentType="image"
          title={caption}
          description=""
          onAddHashtag={tag => {
            setCaption(prev => prev + " #" + tag);
            setIsCaptionDirty(true);
          }}
        />
      </div>

      <div className="form-row-modern">
        <div className="form-group-modern">
          <label>Location</label>
          <div className="input-with-icon">
            <span className="input-icon">📍</span>
            <input
              type="text"
              className="modern-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add Location"
            />
          </div>
        </div>
      </div>

      <div className="form-group-modern">
        <label>Post Type</label>
        <div className="segment-control">
          <button type="button" className={isReel ? "active" : ""} onClick={() => setIsReel(true)}>
            🎬 Reel (Recommended)
          </button>
          <button
            type="button"
            className={!isReel ? "active" : ""}
            onClick={() => setIsReel(false)}
          >
            🖼️ Post / Carousel
          </button>
        </div>
      </div>

      {isReel && (
        <div
          className="toggle-card"
          style={{
            marginBottom: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            padding: "8px 16px",
          }}
        >
          <span className="toggle-label" style={{ marginBottom: 0 }}>
            Also share to Feed
          </span>
          <label className="toggle-container">
            <input
              type="checkbox"
              checked={shareToFeed}
              onChange={e => setShareToFeed(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPaidPartnership}
            onChange={e => setIsPaidPartnership(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Add "Paid Partnership" Label</span>
        </label>

        {isPaidPartnership && (
          <div className="sub-settings fade-in">
            <div className="form-group-modern">
              <label>Brand Partner (Username)</label>
              <div className="input-with-icon">
                <span className="input-icon">@</span>
                <input
                  type="text"
                  className="modern-input"
                  placeholder="nike"
                  value={sponsorUser}
                  onChange={e => setSponsorUser(e.target.value)}
                />
              </div>
              <p className="legal-hint">
                This will tag the brand partner and allow them to see metrics.
              </p>
            </div>
          </div>
        )}
      </div>

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

      <div
        style={{
          fontSize: "0.85rem",
          color: "#6b7280",
          marginTop: "12px",
          padding: "8px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          border: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>ℹ️</span>
        <span>
          Note: Video processing may take a few minutes to reflect on your Instagram Account.
        </span>
      </div>
    </div>
  );
};

export default InstagramForm;
