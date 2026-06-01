import React from "react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import "./UploadPanel.css";

function UploadPanel({
  onUpload,
  initialFile,
  onClearInitialFile,
}) {
  return (
    <section className="upload-panel">
      <h3 style={{ margin: 0 }}>Upload Content</h3>
      <UnifiedPublisher
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
