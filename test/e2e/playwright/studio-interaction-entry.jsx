import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ViralClipStudio from "../../../frontend/src/components/ViralClipStudio";
import "../../../frontend/src/App.css";

// Local interaction fixture. No user session or cloud API is supplied.
const source = `${window.location.origin}/fixture.mp4`;
const sequence =
  new URLSearchParams(window.location.search).get("fixture") === "sequence";
createRoot(document.getElementById("root")).render(
  <>
    <ViralClipStudio
      videoUrl={source}
      sourceName={sequence ? "Sequence first" : "Interaction fixture"}
      clips={[
        {
          id: "fixture-range",
          name: "Trimmed fixture",
          start: sequence ? 0 : 2,
          end: sequence ? 12 : 8,
          duration: sequence ? 12 : 6,
          sourceDuration: 12,
          url: source,
        },
      ]}
      onCancel={() => {}}
      importedCameraMaster={
        sequence
          ? {
              id: "second",
              name: "Sequence second",
              duration: 4,
              url: `${window.location.origin}/fixture-second.mp4`,
              storagePath: "studio/sources/local-fixture/second.mp4",
            }
          : undefined
      }
      onSave={
        sequence
          ? async (clip, overlays, options) => {
              window.__studioFixtureExport = { clip, overlays, options };
            }
          : undefined
      }
    />
    <Toaster />
  </>,
);
