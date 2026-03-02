import React, { useState, useEffect } from "react";
import { sanitizeUrl } from "../../utils/security";
import "../../ContentUploadForm.css";

const TelegramForm = ({
  onChange,
  initialData = {},
  globalDescription,
  currentFile,
  onReviewAI,
}) => {
  const [chatId, setChatId] = useState(initialData.chatId || "");
  const [message, setMessage] = useState(initialData.message || "");
  const [isDirtyMessage, setIsDirtyMessage] = useState(false);

  // Sync with global description unless edited
  useEffect(() => {
    if (!isDirtyMessage && globalDescription) {
      setMessage(globalDescription);
    }
  }, [globalDescription, isDirtyMessage]);

  useEffect(() => {
    onChange({
      platform: "telegram",
      chatId,
      message,
    });
  }, [chatId, message, onChange]);

  const handleMessageChange = e => {
    setMessage(e.target.value);
    setIsDirtyMessage(true);
  };

  return (
    <div className="platform-form telegram-form">
      <h4 className="platform-form-header">
        <span className="icon">✈️</span> Telegram Configuration
      </h4>
      <div
        style={{
          backgroundColor: "rgba(0, 136, 204, 0.1)",
          padding: "12px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "13px",
          color: "#0088cc",
          border: "1px solid rgba(0, 136, 204, 0.2)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ fontSize: "1.2em" }}>ℹ️</span>
        <span>
          <strong>Native Host:</strong> Supports direct Video, Photo, and Text messages to your
          chat/channel.
        </span>
      </div>

      <div className="form-group">
        <label className="field-label">Chat ID or Username</label>
        <input
          type="text"
          placeholder="@mychannel or -100123456789"
          className="modern-input"
          value={chatId}
          onChange={e => setChatId(e.target.value)}
        />
        <small className="field-hint">Enter the target channel/group username or numeric ID.</small>
      </div>

      <div className="form-group">
        <div
          className="label-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <label className="field-label">Caption / Message</label>
          <button
            type="button"
            className="ai-polish-btn"
            onClick={() => onReviewAI && onReviewAI("telegram", message, setMessage)}
            title="Polish with AI"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              border: "none",
              borderRadius: "4px",
              color: "white",
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>✨</span> Polish
          </button>
        </div>
        <textarea
          placeholder="Enter message caption..."
          className="modern-textarea"
          value={message}
          onChange={handleMessageChange}
          rows={4}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
          }}
        />
      </div>

      {currentFile && (
        <div
          className="media-preview-section"
          style={{ marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "16px" }}
        >
          <label className="field-label" style={{ display: "block", marginBottom: "8px" }}>
            Media Preview
          </label>
          <div
            className="preview-container"
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {currentFile.type?.startsWith("video/") ? (
              <video
                src={sanitizeUrl(currentFile.preview)}
                controls
                style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "4px" }}
              />
            ) : (
              <img
                src={sanitizeUrl(currentFile.preview)}
                alt="Preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: "200px",
                  borderRadius: "4px",
                  objectFit: "contain",
                }}
              />
            )}
            <div
              className="file-info"
              style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}
            >
              <span>{currentFile.name}</span>
              <span style={{ margin: "0 8px" }}>•</span>
              <span>{(currentFile.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelegramForm;
