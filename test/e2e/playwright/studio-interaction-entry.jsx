import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ViralClipStudio from "../../../frontend/src/components/ViralClipStudio";
import { buildViralRenderData } from "../../../frontend/src/components/viralRenderPayload";
import { saveViralStudioProject, listViralStudioProjects } from "../../../frontend/src/components/viralStudioProjectStore";
import "../../../frontend/src/App.css";

// Local interaction fixture. No user session or cloud API is supplied.
const podcast = new URLSearchParams(window.location.search).get("fixture") === "podcast";
const factory = new URLSearchParams(window.location.search).get("fixture") === "factory";
const source = `${window.location.origin}/${podcast ? "podcast-source-45s.mp4" : "fixture.mp4"}`;
const sequence =
  new URLSearchParams(window.location.search).get("fixture") === "sequence";
async function mount() {
const factoryProject = factory ? await fetch("/content-factory-project.json").then(response => {
  if (!response.ok) throw new Error("Private factory project is unavailable");
  return response.json();
}) : null;
if (factoryProject) {
  const preserve = new URLSearchParams(window.location.search).get("preserve") === "1";
  const saved = preserve ? await listViralStudioProjects() : [];
  if (!saved.some(project => project.id === factoryProject.project.id)) {
    await saveViralStudioProject(factoryProject.project);
  } else {
    factoryProject.project = saved.find(project => project.id === factoryProject.project.id);
  }
}
const factoryClip = factoryProject?.clip;
const currentSource = factoryClip?.url || source;
const captionArtifact = podcast ? await fetch("/gpu-caption-artifact.json").then(response => {
  if (!response.ok) throw new Error("GPU caption evidence is unavailable");
  return response.json();
}) : null;
createRoot(document.getElementById("root")).render(
  <>
    <ViralClipStudio
      videoUrl={currentSource}
      sourceName={factoryProject ? factoryProject.project.name : podcast ? "TMT podcast · NVIDIA caption draft" : sequence ? "Sequence first" : "Interaction fixture"}
      initialSavedProject={factoryProject?.project || null}
      clips={factoryClip ? [factoryClip] : [
        {
          id: "fixture-range",
          name: podcast ? "TMT podcast · source excerpt" : "Trimmed fixture",
          start: podcast ? 16.08 : sequence ? 0 : 2,
          end: podcast ? 36.08 : sequence ? 12 : 8,
          duration: podcast ? 20 : sequence ? 12 : 6,
          sourceDuration: podcast ? 46.001 : 12,
          url: source,
          ...(podcast ? { autoCaptions: true, segments: captionArtifact.segments.map(segment => ({ ...segment, textReviewRequired: true, textReviewed: false, reviewRequired: true })) } : {}),
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
        sequence || podcast || factory
          ? async (clip, overlays, options) => {
              window.__studioFixtureExport = { clip, overlays, options };
              window.__studioFixtureRenderRequest = buildViralRenderData({ finalVideoUrl: currentSource, selectedClip: clip, overlays, extraOptions: options });
            }
          : undefined
      }
    />
    <Toaster />
  </>,
);
}
mount().catch(error => { console.error(error); document.body.textContent = error.message; });
