import React, { useState, useEffect, useMemo } from "react";
import EmojiPicker from "../EmojiPicker";
import { sanitizeUrl } from "../../utils/security";
import { API_BASE_URL } from "../../config";
import AdaptiveMediaPreview from "./AdaptiveMediaPreview";
import { revokeObjectUrlLater } from "../../utils/objectUrl";

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
      return () => revokeObjectUrlLater(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [currentFile]);

  const [subreddit, setSubreddit] = useState(initialData.subreddit || "");
  const [manualSubreddit, setManualSubreddit] = useState(initialData.subreddit || "");
  const [availableSubreddits, setAvailableSubreddits] = useState([]);
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [subredditFetchError, setSubredditFetchError] = useState("");
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [flairId] = useState(initialData.flairId || "");
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

  const normalizedAvailableSubreddits = useMemo(
    () =>
      (availableSubreddits || [])
        .map(s => ({
          name: String(s.name || "").trim().replace(/^r\//i, ""),
          title: s.title || s.name || "",
        }))
        .filter(s => !!s.name),
    [availableSubreddits]
  );

  useEffect(() => {
    let isMounted = true;

    const fetchSubreddits = async () => {
      setIsLoadingSubreddits(true);
      setSubredditFetchError("");

      try {
        const token =
          (typeof window !== "undefined" &&
            (localStorage.getItem("token") ||
              localStorage.getItem("authToken") ||
              sessionStorage.getItem("token") ||
              sessionStorage.getItem("authToken"))) ||
          null;

        const res = await fetch(`${API_BASE_URL}/api/reddit/metadata`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          throw new Error(`Failed to load subreddits (${res.status})`);
        }

        const data = await res.json();
        const subs = data?.meta?.subreddits || [];

        if (!isMounted) return;
        setAvailableSubreddits(subs);

        const normalizedInitial = String(initialData.subreddit || "")
          .replace(/^r\//i, "")
          .trim();

        const storedLast = (typeof window !== "undefined" && localStorage.getItem("lastRedditSubreddit")) || "";
        const normalizedStored = String(storedLast).replace(/^r\//i, "").trim();

        const fallback =
          normalizedInitial ||
          normalizedStored ||
          (subs[0] && String(subs[0].name || "").replace(/^r\//i, "").trim()) ||
          "";

        if (fallback) {
          setSubreddit(fallback);
          setManualSubreddit(fallback);
        }
      } catch (err) {
        if (!isMounted) return;
        setSubredditFetchError(err.message || "Could not load subreddit list");
      } finally {
        if (isMounted) setIsLoadingSubreddits(false);
      }
    };

    fetchSubreddits();

    return () => {
      isMounted = false;
    };
  }, [initialData.subreddit]);

  useEffect(() => {
    const normalized = String(subreddit || "").replace(/^r\//i, "").trim();
    onChange({
      platform: "reddit",
      subreddit: normalized,
      title,
      flairId,
      isNSFW,
      isSpoiler,
      isPromotional,
    });
    if (normalized && typeof window !== "undefined") {
      localStorage.setItem("lastRedditSubreddit", normalized);
    }
  }, [subreddit, title, flairId, isNSFW, isSpoiler, isPromotional]);

  const handleInsertEmoji = emoji => {
    const emojiChar = typeof emoji === "object" && emoji.native ? emoji.native : emoji;
    setTitle(prev => prev + emojiChar);
    setIsDirtyTitle(true);
    setShowEmojiPicker(false);
  };

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
          <AdaptiveMediaPreview
            src={videoPreviewUrl}
            mediaType="video"
            label="Reddit media preview"
          />
        )}
      </div>

      <div className="form-group-modern">
        <label>Where should this be posted? (required)</label>

        {normalizedAvailableSubreddits.length > 0 ? (
          <>
            <select
              className="modern-input"
              value={subreddit}
              onChange={e => setSubreddit(String(e.target.value || "").replace(/^r\//i, "").trim())}
              required
            >
              {normalizedAvailableSubreddits.map(s => (
                <option key={s.name} value={s.name}>
                  r/{s.name} — {s.title}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#64748b" }}>
              Connected communities loaded automatically. You can still enter one manually below.
            </div>

            <div className="input-with-icon" style={{ marginTop: 8 }}>
              <span className="input-icon">r/</span>
              <input
                type="text"
                className="modern-input"
                value={manualSubreddit}
                onChange={e => {
                  const v = String(e.target.value || "").replace(/^r\//i, "").trim();
                  setManualSubreddit(v);
                  setSubreddit(v);
                }}
                placeholder="Type another subreddit if needed"
              />
            </div>
          </>
        ) : (
          <div className="input-with-icon">
            <span className="input-icon">r/</span>
            <input
              type="text"
              className="modern-input"
              value={subreddit}
              onChange={e => setSubreddit(String(e.target.value || "").replace(/^r\//i, "").trim())}
              placeholder={isLoadingSubreddits ? "Loading communities..." : "videos"}
              required
            />
          </div>
        )}

        {subredditFetchError && (
          <p className="help-text" style={{ fontSize: "0.75rem", color: "#b91c1c", marginTop: "4px" }}>
            Could not auto-load your communities. You can still type one manually.
          </p>
        )}

        <p className="help-text" style={{ fontSize: "0.75rem", color: "#666", marginTop: "4px" }}>
          We auto-fill communities from your connected Reddit account. Example: <code>videos</code>.
        </p>
      </div>

      <div className="form-group-modern">
        <label>Title</label>
        <div style={{ position: "relative" }}>
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
                onSelect={handleInsertEmoji}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>
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
