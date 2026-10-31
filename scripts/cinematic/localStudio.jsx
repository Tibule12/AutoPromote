import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ViralClipStudio from "../../frontend/src/components/ViralClipStudio";
import { listViralStudioProjects } from "../../frontend/src/components/viralStudioProjectStore";

function LocalStudio() {
  const [asset, setAsset] = useState(null), [project, setProject] = useState(undefined), [error, setError] = useState("");
  const [sceneReview, setSceneReview] = useState(null);
  useEffect(() => {
    Promise.all([fetch("/api/cinematic/assets").then(response => response.json()), listViralStudioProjects()])
      .then(([result, projects]) => { setAsset(result.assets[0]); setProject(projects[0] || null); })
      .catch(err => setError(err.message));
  }, []);
  return <>
    <header style={{ padding: "10px 20px", color: "#e9edf4", background: "#101923", font: "13px sans-serif", borderBottom: "1px solid #425265" }}>
      AutoPromote Studio · isolated cinematic development · local CPU · external cost $0 · Firebase and billing disabled
      {sceneReview && <span> · {sceneReview.label}</span>}
    </header>
    {error && <p role="alert">{error}</p>}
    {project !== undefined && <ViralClipStudio
      videoUrl={asset ? `/api/cinematic/assets/${asset.id}/media` : ""}
      sourceName={asset?.name || "Import a local source"}
      sourceContentHash={asset?.id}
      clips={asset ? [{ id: "main", start: 0, end: Math.min(8, asset.duration), duration: Math.min(8, asset.duration), sourceClipId: asset.id, contentHash: asset.id }] : []}
      initialSavedProject={project}
      renderedOutput={sceneReview}
      onCinematicSceneReview={setSceneReview}
      onEditInvalidated={() => setSceneReview(null)}
      onProjectOpened={() => setSceneReview(null)}
      onSave={() => { throw new Error("Use Motion → Cinematic scene → Render scene export for this local milestone"); }}
      onCancel={() => {}}
    />}
    <Toaster />
  </>;
}
createRoot(document.getElementById("root")).render(<LocalStudio />);
