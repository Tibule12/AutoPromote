import React, { useState, useEffect } from "react";
import { sanitizeUrl } from "../../utils/security";
import EmojiPicker from "../EmojiPicker";
import HashtagSuggestions from "../HashtagSuggestions";
import { OPTIMAL_TIMES } from "../BestTimeToPost";

const categories = [
  { id: "1", name: "Film & Animation" },
  { id: "2", name: "Autos & Vehicles" },
  { id: "10", name: "Music" },
  { id: "15", name: "Pets & Animals" },
  { id: "17", name: "Sports" },
  { id: "20", name: "Gaming" },
  { id: "22", name: "People & Blogs" },
  { id: "23", name: "Comedy" },
  { id: "24", name: "Entertainment" },
  { id: "28", name: "Science & Technology" },
  { id: "27", name: "Education" },
];

const YouTubeForm = ({
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
  onFileChange,
  currentFile,
  onReviewAI,
  onFindViralClips,
}) => {
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const channelTitle =
    creatorInfo?.snippet?.title || creatorInfo?.channelTitle || creatorInfo?.display_name || null;
  const channelAvatar =
    creatorInfo?.snippet?.thumbnails?.default?.url ||
    creatorInfo?.snippet?.thumbnails?.medium?.url ||
    creatorInfo?.snippet?.thumbnails?.high?.url ||
    null;

  useEffect(() => {
    if (currentFile && currentFile instanceof File) {
      const url = URL.createObjectURL(currentFile);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [currentFile]);

  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [isTitleDirty, setIsTitleDirty] = useState(false); // Track if user edited manually

  const [description, setDescription] = useState(
    initialData.description || globalDescription || ""
  );
  const [isDescriptionDirty, setIsDescriptionDirty] = useState(false);

  // Sync Global Title changes UNLESS user has edited locally
  useEffect(() => {
    if (!isTitleDirty && globalTitle && globalTitle !== title) {
      setTitle(globalTitle);
    }
  }, [globalTitle, isTitleDirty]);

  // Sync Global Description changes UNLESS user has edited locally
  useEffect(() => {
    if (!isDescriptionDirty && globalDescription && globalDescription !== description) {
      setDescription(globalDescription);
    }
  }, [globalDescription, isDescriptionDirty]);

  const [privacy, setPrivacy] = useState(initialData.privacy || "public");
  const [madeForKids, setMadeForKids] = useState(initialData.madeForKids || false);
  const [tags, setTags] = useState(initialData.tags || "");
  const [category, setCategory] = useState(initialData.category || "22"); // 22 = People & Blogs
  const [paidPromotion, setPaidPromotion] = useState(initialData.paidPromotion || false);
  const [shortsMode, setShortsMode] = useState(initialData.shortsMode || false);

  // States for Emoji Picker
  const [showEmojiPicker, setShowEmojiPicker] = useState({ field: null, visible: false });

  const handleInsertEmoji = emoji => {
    if (showEmojiPicker.field === "title") {
      setTitle(prev => prev + emoji);
      setIsTitleDirty(true);
    } else if (showEmojiPicker.field === "description") {
      setDescription(prev => prev + emoji);
      setIsDescriptionDirty(true);
    }
    setShowEmojiPicker({ field: null, visible: false });
  };

  useEffect(() => {
    onChange({
      platform: "youtube",
      title,
      description,
      privacy,
      madeForKids,
      tags,
      category,
      paidPromotion,
      shortsMode,
    });
  }, [title, description, privacy, madeForKids, tags, category, paidPromotion, shortsMode]);

  return (
    <div className="platform-form youtube-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#FF0000" }}>
          ▶
        </span>{" "}
        YouTube Studio
      </h4>

      {/* IDENTITY: Show Channel Name if Available (Added for Audit) */}
      {channelTitle ? (
        <div className="identity-badge" style={{ marginBottom: "16px" }}>
          {channelAvatar ? (
            <img
              src={channelAvatar}
              alt="Channel"
              style={{ width: 24, height: 24, borderRadius: "50%", verticalAlign: "middle" }}
            />
          ) : (
            <span style={{ fontSize: 18, lineHeight: 1 }}>▶</span>
          )}
          <span style={{ marginLeft: 8, fontWeight: "600" }}>
            {channelTitle}
          </span>
        </div>
      ) : (
        <div className="alert-box warning">
          Could not load channel info. Ensure you are connected.
        </div>
      )}

      {/* SCOPE EXPLANATION: Essential for Audit */}
      <div
        className="scope-info-box"
        style={{
          marginBottom: "16px",
          padding: "12px",
          background: "#fff5f5",
          borderRadius: "8px",
          border: "1px solid #fee2e2",
          fontSize: "0.85rem",
        }}
      >
        <div
          style={{
            fontWeight: "600",
            marginBottom: "6px",
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>🔒</span> Data Access & Permissions
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
                border: "1px solid #fecaca",
                fontFamily: "monospace",
                color: "#991b1b",
              }}
            >
              youtube.upload
            </code>
            : Used solely to upload this video file to the channel listed above.
          </li>
          <li>
            <code
              style={{
                background: "#fff",
                padding: "2px 4px",
                borderRadius: "3px",
                border: "1px solid #fecaca",
                fontFamily: "monospace",
                color: "#991b1b",
              }}
            >
              youtube.readonly
            </code>
            : Used to verify your channel name/avatar (displayed above) so you know which account
            you are posting to.
          </li>
        </ul>
        <p
          style={{
            margin: "8px 0 0 0",
            color: "#7f1d1d",
            fontSize: "0.8rem",
            fontStyle: "italic",
            borderTop: "1px solid #fee2e2",
            paddingTop: "6px",
          }}
        >
          <strong>Privacy Guarantee:</strong> We cannot delete videos, manage comments, or access
          your viewing history.
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
              setIsTitleDirty(true);
            }}
            placeholder="Video Title"
          />
          <button
            className="emoji-trigger-btn"
            onClick={() =>
              setShowEmojiPicker({
                field: "title",
                visible: !showEmojiPicker.visible || showEmojiPicker.field !== "title",
              })
            }
          >
            😊
          </button>
          {showEmojiPicker.visible && showEmojiPicker.field === "title" && (
            <div className="emoji-popover-container">
              <EmojiPicker onSelect={handleInsertEmoji} />
            </div>
          )}
        </div>
      </div>

      {OPTIMAL_TIMES.youtube && (
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
            {OPTIMAL_TIMES.youtube.days.slice(0, 2).join(", ")} @ {OPTIMAL_TIMES.youtube.hours[0]}
            :00. Consider scheduling your video for maximum reach.
          </span>
        </div>
      )}

      <div className="form-group-modern">
        <label htmlFor="youtube-file-input" className="form-label-bold">
          Video File
        </label>
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
              : "Use global file or select unique file for YouTube"}
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
          id="youtube-file-input"
          type="file"
          accept="video/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
        {/* --- REVIEW AI ENHANCEMENTS for YouTube-specific File OR Global File --- */}
        {(currentFile || !currentFile) && (onReviewAI || onFindViralClips) && (
          <div style={{ display: "flex", gap: "10px", marginTop: 8 }}>
            {onReviewAI && (
              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
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
                }}
                onClick={onFindViralClips}
              >
                🔥 Find Viral Clips
              </button>
            )}
          </div>
        )}

        {/* SIMPLE INLINE VIDEO PREVIEW */}
        {videoPreviewUrl && (
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

      <div
        className="scope-info-box"
        style={{
          marginBottom: "16px",
          padding: "12px",
          background: "#fff9f9",
          borderRadius: "8px",
          border: "1px solid #ffecec",
          fontSize: "0.85rem",
        }}
      >
        <div
          style={{
            fontWeight: "600",
            marginBottom: "4px",
            color: "#cc0000",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>🔐</span> Google Permissions
        </div>
        <p style={{ margin: 0, color: "#444", lineHeight: "1.4" }}>
          We use{" "}
          <code
            style={{
              background: "#fff",
              padding: "2px 4px",
              borderRadius: "3px",
              border: "1px solid #ffcccc",
              fontFamily: "monospace",
              color: "#c00",
            }}
          >
            youtube.upload
          </code>
          {" and "}
          <code
            style={{
              background: "#fff",
              padding: "2px 4px",
              borderRadius: "3px",
              border: "1px solid #ffcccc",
              fontFamily: "monospace",
              color: "#c00",
            }}
          >
            youtube.readonly
          </code>{" "}
          to manage your videos. We do not delete your existing videos or manage your account
          settings. The <code>readonly</code> permission allows us to check channel status and
          analytics to optimize your upload times.
        </p>
      </div>

      <div className="form-group-modern">
        <label htmlFor="youtube-title-input">Video Title</label>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            id="youtube-title-input"
            type="text"
            className="modern-input"
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              setIsTitleDirty(true);
            }}
            maxLength={100}
            placeholder="Create a title that hooks viewers"
            style={{ paddingRight: "40px" }}
          />
          <button
            type="button"
            style={{
              position: "absolute",
              right: "8px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              opacity: 0.7,
            }}
            onClick={() =>
              setShowEmojiPicker({ field: "title", visible: !showEmojiPicker.visible })
            }
          >
            😊
          </button>
          {showEmojiPicker.visible && showEmojiPicker.field === "title" && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", right: 0 }}>
              <EmojiPicker
                onSelect={handleInsertEmoji}
                onClose={() => setShowEmojiPicker({ field: null, visible: false })}
              />
            </div>
          )}
        </div>
        <div className="char-count">{title.length}/100</div>
      </div>

      <div className="form-group-modern">
        <label>Description</label>
        <div style={{ position: "relative" }}>
          <textarea
            className="modern-input"
            value={description}
            onChange={e => {
              setDescription(e.target.value);
              setIsDescriptionDirty(true);
            }}
            placeholder="Tell viewers about your video..."
            rows={5}
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
            onClick={() =>
              setShowEmojiPicker({ field: "description", visible: !showEmojiPicker.visible })
            }
          >
            😊
          </button>
          {showEmojiPicker.visible && showEmojiPicker.field === "description" && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", right: 0 }}>
              <EmojiPicker
                onSelect={handleInsertEmoji}
                onClose={() => setShowEmojiPicker({ field: null, visible: false })}
              />
            </div>
          )}
        </div>
        <HashtagSuggestions
          contentType="video"
          title={title}
          description={description}
          onAddHashtag={tag => {
            setDescription(prev => prev + " #" + tag);
            setIsDescriptionDirty(true);
          }}
        />
      </div>

      <div className="form-row-modern two-col">
        <div className="form-group-modern">
          <label>Visibility</label>
          <select
            className="modern-select"
            value={privacy}
            onChange={e => setPrivacy(e.target.value)}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div className="form-group-modern">
          <label>Category</label>
          <select
            className="modern-select"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group-modern">
        <label>Tags (comma separated)</label>
        <input
          type="text"
          className="modern-input"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="gaming, vlog, tutorial"
        />
      </div>

      <div className="compliance-section">
        <h5 className="section-label">Audience & Compliance</h5>

        <label className="checkbox-modern warning-theme">
          <input
            type="checkbox"
            checked={madeForKids}
            onChange={e => setMadeForKids(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">
            Made for Kids
            <span className="tooltip-icon" title="Required by COPPA">
              ?
            </span>
          </span>
        </label>

        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={paidPromotion}
            onChange={e => setPaidPromotion(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Includes Paid Promotion</span>
        </label>

        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={shortsMode}
            onChange={e => setShortsMode(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">
            Shorts (Portrait &lt;60s)
            <span className="tooltip-icon" title="Upload as YouTube Short">
              ?
            </span>
          </span>
        </label>
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
          Note: Video processing may take a few minutes to reflect on your YouTube Channel.
        </span>
      </div>
    </div>
  );
};

export default YouTubeForm;
