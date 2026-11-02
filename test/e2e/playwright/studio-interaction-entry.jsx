import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ViralClipStudio from "../../../frontend/src/components/ViralClipStudio";
import { buildViralRenderData } from "../../../frontend/src/components/viralRenderPayload";
import {
  compileStudioCompositionForRender,
  compileStudioFinishForRender,
  compileStudioOverlaysForRender,
} from "../../../frontend/src/components/studioRenderCompiler";
import { saveViralStudioProject, listViralStudioProjects } from "../../../frontend/src/components/viralStudioProjectStore";
import "../../../frontend/src/App.css";

// Local interaction fixture. No user session or cloud API is supplied.
const params = new URLSearchParams(window.location.search);
const podcast = params.get("fixture") === "podcast";
const factory = params.get("fixture") === "factory";
const motionflow = params.get("fixture") === "motionflow";
const motionflowReloaded = params.get("reloaded") === "1";
const source = `${window.location.origin}/${
  podcast ? "podcast-source-45s.mp4" : motionflow ? "motionflow-source.mp4" : "fixture.mp4"
}`;
const sequence = params.get("fixture") === "sequence";
const motionflowSeedProject =
  motionflow && !motionflowReloaded
    ? {
        id: "motionflow-seed-project",
        name: "AutoPromote Motion & Flow Plates",
        snapshot: {
          orderedClips: [
            {
              id: "fixture-range",
              name: "AutoPromote Motion & Flow clip",
              start: 0,
              end: 6,
              duration: 6,
              sourceDuration: 6,
              url: source,
            },
          ],
          selectedClipId: "fixture-range",
          timeline: [
            {
              id: "seg-1",
              sourceClipId: "fixture-range",
              name: "AutoPromote Motion & Flow clip",
              start: 0,
              end: 6,
              duration: 6,
              sourceDuration: 6,
              url: source,
            },
          ],
          smartCrop: false,
          mainFrame: {
            enabled: false,
            insetPercent: 0,
            radiusPercent: 0,
            background: "studio_black",
          },
          exportSettings: {
            resolution: "1080p",
            fps: "24",
            codec: "h264",
            quality: "high",
          },
          comparisonMode: "after",
          overlays: [
            {
              id: "matte-plate",
              name: "Ellipse Matte Source",
              type: "image",
              src: `${window.location.origin}/motionflow-matte-plate.png`,
              x: 50,
              y: 50,
              width: 36,
              height: 22,
              scale: 1,
              rotation: 0,
              opacity: 1,
              startTime: 0,
              duration: 6,
              bRollMode: "pip",
              mediaFit: "stretch",
              frameShape: "edge",
              borderRadius: 0,
              shadow: "none",
              mask: { enabled: true, shape: "ellipse", feather: 0, invert: false },
            },
            {
              id: "fill-cyan",
              name: "Cyan Fill Plate",
              type: "image",
              src: `${window.location.origin}/motionflow-fill-cyan.png`,
              x: 50,
              y: 50,
              width: 58,
              height: 36,
              scale: 1,
              rotation: 0,
              opacity: 1,
              startTime: 0,
              duration: 6,
              bRollMode: "pip",
              mediaFit: "stretch",
              frameShape: "edge",
              borderRadius: 0,
              shadow: "none",
            },
          ],
        },
      }
    : null;
async function mount() {
const factoryProject = factory ? await fetch("/content-factory-project.json").then(response => {
  if (!response.ok) throw new Error("Private factory project is unavailable");
  return response.json();
}) : null;
if (factoryProject) {
  const preserve = params.get("preserve") === "1";
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
if (motionflow) {
  window.__compileSavedStudioProjectForParity = async projectName => {
    const projects = await listViralStudioProjects();
    const record = projects.find(item => item.name === projectName);
    if (!record?.snapshot?.studioDocument) {
      throw new Error(`Saved project "${projectName}" was not found in IndexedDB`);
    }
    const doc = record.snapshot.studioDocument;
    const compiledOverlays = compileStudioOverlaysForRender(doc, record.snapshot);
    const compositionPlan = compileStudioCompositionForRender(doc);
    const finishPlan = compileStudioFinishForRender(doc);
    return {
      projectId: record.id,
      projectName: record.name,
      revision: doc.revision,
      studioDocument: doc,
      renderRequest: buildViralRenderData({
        finalVideoUrl: currentSource,
        selectedClip: { id: "fixture-range", start: 0, end: 6, duration: 6 },
        overlays: compiledOverlays,
        extraOptions: {
          compositionPlan,
          finishPlan,
          smartCrop: false,
          outputSettings: { width: 360, height: 640, fps: 24, aspectRatio: "9:16" },
        },
      }),
    };
  };
}
createRoot(document.getElementById("root")).render(
  <>
    <ViralClipStudio
      videoUrl={currentSource}
      sourceName={factoryProject ? factoryProject.project.name : podcast ? "TMT podcast · NVIDIA caption draft" : sequence ? "Sequence first" : motionflow ? "AutoPromote Motion & Flow source" : "Interaction fixture"}
      initialSavedProject={factoryProject?.project || motionflowSeedProject}
      clips={factoryClip ? [factoryClip] : [
        {
          id: "fixture-range",
          name: podcast ? "TMT podcast · source excerpt" : motionflow ? "AutoPromote Motion & Flow clip" : "Trimmed fixture",
          start: podcast ? 16.08 : sequence || motionflow ? 0 : 2,
          end: podcast ? 36.08 : sequence ? 12 : motionflow ? 6 : 8,
          duration: podcast ? 20 : sequence ? 12 : 6,
          sourceDuration: podcast ? 46.001 : motionflow ? 6 : 12,
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
        sequence || podcast || factory || motionflow
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
