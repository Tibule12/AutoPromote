import React, { useState, useEffect } from "react";
import "../../ContentUploadForm.css";

const SnapchatForm = ({ onChange, initialData = {} }) => {
  // Snapchat currently has no specific per-post fields in the frontend,
  // but we render the warning/info box.

  useEffect(() => {
    // Just register existence
    onChange({ platform: "snapchat" });
  }, [onChange]);

  return (
    <div className="platform-form snapchat-form">
      <h4 className="platform-form-header">
        <span className="icon">👻</span> Snapchat Configuration
      </h4>
      <div className="snapchat-feature-inline">
        <div
          style={{
            fontSize: 12,
            color: "#666",
            background: "#fff",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #e5e5e5",
          }}
        >
          Server-side publishing creates <strong>Ads</strong> (Dark Posts/Spotlight) via Marketing
          API. To post standard user Stories, use the mobile app.
        </div>
      </div>
    </div>
  );
};

export default SnapchatForm;
