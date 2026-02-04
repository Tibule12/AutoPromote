import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";

const TwitterForm = ({ onChange, initialData = {} }) => {
  const [message, setMessage] = useState(initialData.message || "");
  const [threadMode, setThreadMode] = useState(initialData.threadMode || false);

  useEffect(() => {
    onChange({ platform: "twitter", message, threadMode });
  }, [message, threadMode, onChange]);

  return (
    <div className="platform-form twitter-form">
      <h4 className="platform-form-header">
        <span className="icon">🐦</span> X (Twitter) Configuration
      </h4>
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
        <textarea
          placeholder="Tweet text..."
          className="modern-input"
          style={{ minHeight: "80px" }}
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
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
