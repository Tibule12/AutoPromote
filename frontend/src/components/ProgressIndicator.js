import React from "react";
import "./ProgressIndicator.css";

function ProgressIndicator({ progress, status, fileName }) {
  return (
    <div className="progress-indicator">
      <div className="progress-header">
        <div className="upload-icon">{progress === 100 ? "✓" : "⬆️"}</div>
        <div className="progress-info">
          <div className="progress-title">{status || "Uploading..."}</div>
          {fileName && <div className="progress-file">{fileName}</div>}
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progress}%` }}>
          <div className="progress-shimmer"></div>
        </div>
      </div>

      <div className="progress-percentage">{progress}%</div>
    </div>
  );
}

export default ProgressIndicator;
