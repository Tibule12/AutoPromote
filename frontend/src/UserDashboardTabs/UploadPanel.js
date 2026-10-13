import React from "react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import "./UploadPanel.css";

function UploadPanel({ onUpload, initialFile, initialDestinations, onClearInitialFile, contentList, defaultTimezone, onNavigate }) {
  return (
    <section className="upload-panel">
      <UnifiedPublisher
        embedded
        onUpload={async params => {
          if (!onUpload) throw new Error("Publishing handler unavailable.");
          const result = await onUpload(params);
          if (result?.ok !== false && onClearInitialFile) onClearInitialFile();
          return result;
        }}
        contentList={contentList}
        defaultTimezone={defaultTimezone}
        onNavigate={onNavigate}
        initialFile={initialFile}
        initialDestinations={initialDestinations}
      />
    </section>
  );
}

export default UploadPanel;
