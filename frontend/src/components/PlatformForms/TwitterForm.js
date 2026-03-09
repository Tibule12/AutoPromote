import React, { useState, useEffect } from "react";
// import "../../ContentUploadForm.css";
import EmojiPicker from "../EmojiPicker";
import HashtagSuggestions from "../HashtagSuggestions";
import { OPTIMAL_TIMES } from "../BestTimeToPost";
import { sanitizeUrl } from "../../utils/security";

const TwitterForm = ({
  onChange,
  initialData = {},
  onFileChange,
  currentFile,
  globalDescription,
  onReviewAI,
  onFindViralClips,
}) => {
  const [message, setMessage] = useState(initialData.message || "");
  const [threadMode, setThreadMode] = useState(initialData.threadMode || false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDirtyMessage, setIsDirtyMessage] = useState(initialData.message ? true : false);

  // Generate preview URL when file changes
  useEffect(() => {
    if (currentFile) {
      const url = URL.createObjectURL(currentFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [currentFile]);

  // Smart Sync: Update message from globalDescription if not manually edited
  useEffect(() => {
    if (!isDirtyMessage && globalDescription) {
      setMessage(globalDescription);
    }
  }, [globalDescription, isDirtyMessage]);

  const handleMessageChange = e => {
    setMessage(e.target.value);
    setIsDirtyMessage(true);
  };

  const handleInsertEmoji = emoji => {
    setMessage(prev => prev + emoji.native);
    setIsDirtyMessage(true);
  };

  useEffect(() => {
    onChange({ platform: "twitter", message, threadMode });
  }, [message, threadMode, onChange]);

  return (
    <div className="platform-form twitter-form">
      <h4 className="platform-form-header">
        <span className="icon">🐦</span> X (Twitter) Configuration
      </h4>
      {OPTIMAL_TIMES.twitter && (
        <div
          style={{
            fontSize: "11px",
            color: "#1d9bf0",
            marginBottom: "12px",
            padding: "8px 10px",
            backgroundColor: "#f0f9ff",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid #bae6fd",
          }}
        >
          <span style={{ fontSize: "14px" }}>⏰</span>
          <span>
            <strong>Best time to post:</strong> {OPTIMAL_TIMES.twitter.days.slice(0, 2).join(", ")}{" "}
            @ {OPTIMAL_TIMES.twitter.hours[0]}:00.
          </span>
        </div>
      )}
      <div
        style={{
          backgroundColor: "rgba(29, 161, 242, 0.1)",
          padding: "8px",
          borderRadius: "4px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#1DA1F2",
          border: "1px solid rgba(29, 161, 242, 0.2)",
        }}
      >
        <strong>Platform Capabilities:</strong> Supports Native Video and Image.
      </div>

      {/* Preview Section */}
      {previewUrl && (
        <div className="preview-container" style={{ marginBottom: "15px", textAlign: "center" }}>
          {currentFile?.type?.startsWith("video") ? (
            <video
              src={sanitizeUrl(previewUrl)}
              controls
              style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px" }}
            />
          ) : (
            <img
              src={sanitizeUrl(previewUrl)}
              alt="Preview"
              style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px" }}
            />
          )}
        </div>
      )}

      <div className="form-group-modern">
        <label className="form-label-bold">Media File</label>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {currentFile
            ? `Selected: ${currentFile.name}`
            : "Use global file or select unique file for X/Twitter"}
        </div>
        <input
          type="file"
          accept="video/*,image/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
      </div>

      <div className="form-group-modern">
        <div style={{ position: "relative" }}>
          <textarea
            placeholder="Tweet text..."
            className="modern-input"
            style={{ minHeight: "80px" }}
            value={message}
            onChange={handleMessageChange}
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
        <div
          style={{
            fontSize: 10,
            textAlign: "right",
            marginTop: 2,
            color: message.length > 280 ? "red" : "#666",
          }}
        >
          {message.length}/280
        </div>

        <HashtagSuggestions
          contentType="text"
          title={message}
          description=""
          onAddHashtag={tag => {
            setMessage(prev => prev + " #" + tag);
            setIsDirtyMessage(true);
          }}
        />

        <div className="ai-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          {onReviewAI && (
            <button
              type="button"
              className="ai-button"
              onClick={() => onReviewAI(message)}
              style={{
                flex: 1,
                padding: "8px",
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#0369a1",
              }}
            >
              <span>✨</span> Review with AI
            </button>
          )}
          {onFindViralClips && currentFile?.type?.startsWith("video") && (
            <button
              type="button"
              className="ai-button"
              onClick={onFindViralClips}
              style={{
                flex: 1,
                padding: "8px",
                background: "#fdf4ff",
                border: "1px solid #f0abfc",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#a21caf",
              }}
            >
              <span>🎬</span> Find Viral Clips
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <label
          style={{
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={!!threadMode}
            onChange={e => setThreadMode(e.target.checked)}
          />
          Thread Mode (Auto-reply if too long)
        </label>
      </div>
    </div>
  );
};

export default TwitterForm;
