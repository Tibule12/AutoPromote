import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ViralClipStudio from "../../frontend/src/components/ViralClipStudio";
import { listViralStudioProjects } from "../../frontend/src/components/viralStudioProjectStore";
import { cinematicRequest } from "../../frontend/src/components/threeD/StudioCinematicPanel";

function LocalStudio() {
  const [asset, setAsset] = useState(null), [project, setProject] = useState(undefined), [error, setError] = useState("");
  const [sceneReview, setSceneReview] = useState(null);
  // Keep source props stable when a finished movie arrives. Recreating the
  // shell's old eight-second fixture here replaced the real project's source
  // catalogue and immediately invalidated a multi-cut finished review.
  const sourceClips=useMemo(()=>project?.snapshot?.orderedClips?.length ? project.snapshot.orderedClips :
    asset?[{id:"main",start:0,end:Math.min(8,asset.duration),duration:Math.min(8,asset.duration),sourceClipId:asset.id,contentHash:asset.id}]:[],[asset,project]);
  useEffect(() => {
    Promise.all([fetch("/api/cinematic/assets").then(response => response.json()), listViralStudioProjects()])
      .then(([result, projects]) => {
        const requested=new URLSearchParams(window.location.search).get("project");
        const selected=projects.find(item=>item.id===requested)||projects[0]||null;
        const hash=selected?.snapshot?.timeline?.[0]?.contentHash;
        setAsset(result.assets.find(item=>item.id===hash)||result.assets[0]);setProject(selected);
      })
      .catch(err => setError(err.message));
  }, []);
  return <>
    <header style={{ padding: "10px 20px", color: "#e9edf4", background: "#101923", font: "13px sans-serif", borderBottom: "1px solid #425265" }}>
      AutoPromote Studio · isolated cinematic development · local CPU · external cost $0 · Firebase and billing disabled
      {sceneReview && <span> · {sceneReview.label}</span>}
      {sceneReview && <a style={{color:"#e7c68c",marginLeft:16}} href={sceneReview.url} download="autopromote-programme.mp4">Download finished programme</a>}
    </header>
    {error && <p role="alert">{error}</p>}
    {project !== undefined && <ViralClipStudio
      videoUrl={asset ? `/api/cinematic/assets/${asset.id}/media` : ""}
      sourceName={asset?.name || "Import a local source"}
      sourceContentHash={asset?.id}
      clips={sourceClips}
      initialSavedProject={project}
      renderedOutput={sceneReview}
      onDownloadRendered={() => {
        if(!sceneReview?.url)return;
        const link=document.createElement("a");link.href=sceneReview.url;link.download="autopromote-programme.mp4";
        document.body.appendChild(link);link.click();link.remove();
      }}
      onCinematicSceneReview={setSceneReview}
      onLocalProgrammeRender={new URLSearchParams(window.location.search).get("offlineWorker")==="true"
        ? document=>cinematicRequest("offline-programmes",{document}) : null}
      onEditInvalidated={() => setSceneReview(null)}
      onProjectOpened={() => setSceneReview(null)}
      onSave={() => { throw new Error("Use Motion → Cinematic scene → Render scene export for this local milestone"); }}
      onCancel={() => {}}
    />}
    <Toaster />
  </>;
}
createRoot(document.getElementById("root")).render(<LocalStudio />);
