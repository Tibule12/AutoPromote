import React from "react";
import MultiCamCombiner from "../components/MultiCamCombiner";
import "./CamCombinerPanel.css";

function CamCombinerPanel({ onClose, onUseExport }) {
  return (
    <section className="dashboard-cam-combiner-page" aria-label="Cam Combiner workspace">
      <MultiCamCombiner
        primaryFile={null}
        onCancel={onClose}
        onComplete={result => onUseExport?.(result)}
        onStatusChange={() => {}}
      />
    </section>
  );
}

export default CamCombinerPanel;
