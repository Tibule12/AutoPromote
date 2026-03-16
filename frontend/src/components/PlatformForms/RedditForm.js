import React, { useState, useEffect } from "react";
import { sanitizeUrl } from "../../utils/security";

const RedditForm = ({
  onChange,
  initialData = {},
  creatorInfo,
  globalTitle,
  globalDescription,
  currentFile,
  onFileChange,
  onReviewAI,
  onFindViralClips,
}) => {
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const redditName =
    creatorInfo?.name || creatorInfo?.meta?.username || creatorInfo?.meta?.name || null;
  const redditIcon = creatorInfo?.icon_img || creatorInfo?.meta?.icon_img || null;
  const redditKarma = creatorInfo?.total_karma || creatorInfo?.meta?.total_karma || null;

  useEffect(() => {
    if (currentFile && currentFile instanceof File) {
      const url = URL.createObjectURL(currentFile);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [currentFile]);

  const [subreddit, setSubreddit] = useState(initialData.subreddit || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [flairId, setFlairId] = useState(initialData.flairId || "");
  const [isNSFW, setIsNSFW] = useState(initialData.isNSFW || false);
  const [isSpoiler, setIsSpoiler] = useState(initialData.isSpoiler || false);
  const [isPromotional, setIsPromotional] = useState(initialData.isPromotional || false);

  // Smart Sync for title
  const [isDirtyTitle, setIsDirtyTitle] = useState(initialData.title ? true : false);

  useEffect(() => {
    if (!isDirtyTitle && globalTitle) {
      setTitle(globalTitle);
    }
  }, [globalTitle, isDirtyTitle]);

  // Mock flairs for now, in real app would fetch based on subreddit
  const [availableFlairs, setAvailableFlairs] = useState([]);

  useEffect(() => {
    onChange({
      platform: "reddit",
      subreddit,
      title,
      flairId,
      isNSFW,
      isSpoiler,
      isPromotional,
    });
  }, [subreddit, title, flairId, isNSFW, isSpoiler, isPromotional]);

  return (
    <div className="platform-form reddit-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#FF4500" }}>
          👽
        </span>{" "}
        Reddit Post
      </h4>

      {/* IDENTITY BADGE */}
      {redditName && (
        <div
          className="identity-badge"
          style={{
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            background: "#fef2f2",
            padding: "8px",
            borderRadius: "6px",
            border: "1px solid #fee2e2",
          }}
        >
          {redditIcon && (
            <img
              src={sanitizeUrl(redditIcon.split("?")[0])}
              alt="User"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                marginRight: 10,
                objectFit: "cover",
              }}
            />
          )}
          <div>
            <div style={{ fontWeight: "600", color: "#333" }}>u/{redditName}</div>
            <div style={{ fontSize: "0.8rem", color: "#666" }}>Karma: {redditKarma ?? "-"}</div>
          </div>
        </div>
      )}

      {/* File Input for Reddit (Added) */}
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
              : "Use global file or select unique file for Reddit"}
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

        {/* --- REVIEW AI ENHANCEMENTS for Reddit --- */}
        {(onReviewAI || onFindViralClips) && (
          <div style={{ display: "flex", gap: "10px", marginTop: 8, marginBottom: 15 }}>
            {onReviewAI && (
              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #FF4500 0%, #FF6D00 100%)",
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
      </div>

      <div className="form-group-modern">
        <label>Subreddit (r/)</label>
        <div className="input-with-icon">
          <span className="input-icon">r/</span>
          <input
            type="text"
            className="modern-input"
            value={subreddit}
            onChange={e => setSubreddit(e.target.value)}
            placeholder="videos"
          />
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
            setIsDirtyTitle(true);
          }}
          placeholder="An interesting title"
          maxLength={300}
        />
        <div className="char-count">{title.length}/300</div>
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPromotional}
            onChange={e => setIsPromotional(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Promotional / Partner Content</span>
        </label>
        {isPromotional && (
          <div style={{ fontSize: "0.8rem", color: "#ff4500", marginTop: "4px" }}>
            ⚠️ Ensure you follow the specific rules of <b>r/{subreddit || "..."}</b> regarding
            self-promotion.
          </div>
        )}
      </div>

      {/* Flair selection would go here if we fetched them */}

      <div className="toggles-row">
        <label className="checkbox-pill warning">
          <input type="checkbox" checked={isNSFW} onChange={e => setIsNSFW(e.target.checked)} />
          <span>🔞 NSFW</span>
        </label>

        <label className="checkbox-pill">
          <input
            type="checkbox"
            checked={isSpoiler}
            onChange={e => setIsSpoiler(e.target.checked)}
          />
          <span>⚠️ Spoiler</span>
        </label>
      </div>

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
          Note: Video processing may take a few minutes to reflect on your Reddit profile.
        </span>
      </div>
    </div>
  );
};

export default RedditForm;
