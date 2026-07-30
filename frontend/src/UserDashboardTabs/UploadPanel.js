import React from "react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import "./UploadPanel.css";

function UploadPanel({ onUpload, initialFile, onClearInitialFile }) {
  return (
    <section className="upload-panel">
      <UnifiedPublisher
        embedded
        onUpload={async params => {
          if (onUpload) {
            await onUpload(params);
          }
          if (onClearInitialFile) onClearInitialFile();
        }}
        initialFile={initialFile}
      />
    </section>
  );
}

export default UploadPanel;
