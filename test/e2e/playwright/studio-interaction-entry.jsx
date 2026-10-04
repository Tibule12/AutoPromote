import React from "react";
import { createRoot } from "react-dom/client";
import ViralClipStudio from "../../../frontend/src/components/ViralClipStudio";
import "../../../frontend/src/App.css";

// Local interaction fixture. No user session or cloud API is supplied.
const source = `${location.origin}/fixture.mp4`;
createRoot(document.getElementById("root")).render(
  <ViralClipStudio
    videoUrl={source}
    sourceName="Interaction fixture"
    clips={[
      {
        id: "fixture-range",
        name: "Trimmed fixture",
        start: 2,
        end: 8,
        duration: 6,
        sourceDuration: 12,
        url: source,
      },
    ]}
    onCancel={() => {}}
  />
);
