import React, { useEffect, useMemo, useState } from "react";
import VideoEditor from "../components/VideoEditor";
import { useSubscription } from "../hooks/useSubscription";
import { sanitizeUrl } from "../utils/security";

const resolveSourceUrl = source => {
  if (typeof source === "string") return sanitizeUrl(source);
  return source?.url ? sanitizeUrl(source.url) : "";
};

const createStudioSource = (sourceFile, clip, sourceDuration) => {
  const fallbackDuration = Math.max(1, Number(sourceDuration || sourceFile?.duration || 30));
  const start = Math.max(0, Number(clip?.start || 0));
  const end = Math.max(start + 0.1, Number(clip?.end || start + fallbackDuration));
  const studioClip = {
    ...clip,
    id: clip?.id || "full-video",
    start,
    end,
    duration: Math.max(0.1, Number(clip?.duration || end - start)),
    reason: clip?.reason || "Full source video loaded for manual editing",
    viralScore: clip?.score || clip?.viralScore || 0,
  };

  if (sourceFile instanceof File || sourceFile instanceof Blob) {
    const studioFile =
      sourceFile instanceof File
        ? new File([sourceFile], sourceFile.name, {
            type: sourceFile.type,
            lastModified: sourceFile.lastModified,
          })
        : new File([sourceFile], "viral-studio-source.mp4", {
            type: sourceFile.type || "video/mp4",
          });
    studioFile.openStudio = true;
    studioFile.clips = [studioClip];
    return studioFile;
  }

  if (sourceFile && typeof sourceFile === "object") {
    return {
      ...sourceFile,
      isRemote: Boolean(sourceFile.isRemote || sourceFile.url),
      openStudio: true,
      clips: [studioClip],
    };
  }

  return {
    name: "viral-studio-source.mp4",
    type: "video/mp4",
    url: typeof sourceFile === "string" ? sourceFile : "",
    isRemote: true,
    openStudio: true,
    clips: [studioClip],
  };
};

function ViralClipStudioPanel({
  initialFile = null,
  initialClip = null,
  onOpenPublisher,
  onUpgrade,
}) {
  const { canUseFeature } = useSubscription();
  const [sourceFile, setSourceFile] = useState(initialFile);
  const [selectedClip, setSelectedClip] = useState(initialClip);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [studioSource, setStudioSource] = useState(null);

  useEffect(() => {
    setSourceFile(initialFile || null);
    setSelectedClip(initialClip || null);
    setSourceDuration(0);
    setStudioSource(null);
  }, [initialClip, initialFile]);

  useEffect(() => {
    if (!(sourceFile instanceof Blob)) {
      setLocalPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(sourceFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceFile]);

  const previewUrl = localPreviewUrl || resolveSourceUrl(sourceFile);
  const sourceName = useMemo(
    () => sourceFile?.name || sourceFile?.fileName || "No source video selected",
    [sourceFile]
  );

  if (studioSource) {
    return (
      <VideoEditor
        file={studioSource}
        onCancel={() => setStudioSource(null)}
        onSave={renderedFile => {
          setStudioSource(null);
          onOpenPublisher?.(renderedFile, selectedClip);
        }}
      />
    );
  }

  return (
    <section className="find-viral-clips-panel viral-studio-entry-panel">
      <div className="viral-clips-workspace">
        <article className="viral-source-card">
          <div className="viral-card-heading">
            <div>
              <span>Studio source</span>
              <h3>Choose a clip or finished video</h3>
            </div>
            <label className="btn-secondary viral-file-picker">
              Choose video
              <input
                type="file"
                accept="video/*"
                onChange={event => {
                  const [file] = Array.from(event.target.files || []);
                  if (!file) return;
                  setSourceFile(file);
                  setSelectedClip(null);
                  setSourceDuration(0);
                }}
              />
            </label>
          </div>

          <div className={`viral-source-preview ${previewUrl ? "has-video" : ""}`}>
            {previewUrl ? (
              <video
                src={previewUrl}
                controls
                preload="metadata"
                onLoadedMetadata={event => setSourceDuration(event.currentTarget.duration || 0)}
              />
            ) : (
              <div className="viral-source-empty">
                <span>▶</span>
                <strong>Open the full timeline editor</strong>
                <small>Use a detected moment or start manually from a finished video</small>
              </div>
            )}
          </div>

          <div className="viral-source-meta">
            <span aria-hidden="true">▣</span>
            <div>
              <strong>{sourceName}</strong>
              <small>
                {selectedClip
                  ? `${Number(selectedClip.start || 0).toFixed(1)}s–${Number(selectedClip.end || 0).toFixed(1)}s detected moment selected`
                  : sourceFile
                    ? "Full source ready for manual editing"
                    : "Select a source to begin"}
              </small>
            </div>
          </div>
        </article>

        <aside className="viral-settings-card">
          <div className="viral-card-heading">
            <div>
              <span>Viral Clip Studio</span>
              <h3>Moments, hooks, B-roll, and export</h3>
            </div>
          </div>
          <div className="viral-destination-field">
            <span>Full workspace</span>
            <div>
              <span>Hook editor</span>
              <span>9:16 preview</span>
              <span>B-roll timeline</span>
              <span>Captions & audio</span>
            </div>
          </div>
          <button
            type="button"
            className="check-quality viral-analyse-button"
            disabled={!sourceFile}
            onClick={() => {
              if (!canUseFeature("viralClipStudio")) {
                onUpgrade?.();
                return;
              }
              setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration));
            }}
          >
            Open Viral Clip Studio
          </button>
          <small className="viral-settings-note">
            This opens the original Viral Clip Studio and keeps its existing render pipeline.
          </small>
        </aside>
      </div>
    </section>
  );
}

export default ViralClipStudioPanel;
