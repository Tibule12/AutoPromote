import React from "react";
import MultiCamCombiner from "../components/MultiCamCombiner";
import "./CamCombinerPanel.css";

function CamCombinerPanel({ onClose, onUseExport, onFindViralClips }) {
  return (
    <section className="dashboard-cam-combiner-page" aria-label="Cam Combiner workspace">
      <MultiCamCombiner
        primaryFile={null}
        onCancel={onClose}
        onComplete={result => onUseExport?.(result)}
        onStatusChange={() => {}}
        onFindViralClips={source => onFindViralClips?.(source)}
      />
    </section>
  );
}

export default CamCombinerPanel;
