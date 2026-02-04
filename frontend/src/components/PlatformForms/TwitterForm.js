import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";
import EmojiPicker from "../EmojiPicker";
import HashtagSuggestions from "../HashtagSuggestions";
import { OPTIMAL_TIMES } from "../BestTimeToPost";

const TwitterForm = ({ onChange, initialData = {}, onFileChange, currentFile }) => {
  const [message, setMessage] = useState(initialData.message || "");
  const [threadMode, setThreadMode] = useState(initialData.threadMode || false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleInsertEmoji = emoji => setMessage(prev => prev + emoji.native);

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
            onChange={e => setMessage(e.target.value)}
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
          onAddHashtag={tag => setMessage(prev => prev + " #" + tag)}
        />
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
