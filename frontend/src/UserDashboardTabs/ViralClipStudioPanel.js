import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoEditor from "../components/VideoEditor";
import { SafeVideo } from "../components/SafeMedia";
import { useSubscription } from "../hooks/useSubscription";
import { sanitizeUrl } from "../utils/security";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import { getAuth } from "firebase/auth";

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
  autoOpen = false,
  onBack,
  onOpenPublisher,
  onUpgrade,
}) {
  const { canUseFeature } = useSubscription();
  const uploadRequestRef = useRef(0);
  const [sourceFile, setSourceFile] = useState(null);
  const [selectedClip, setSelectedClip] = useState(initialClip);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [sourceState, setSourceState] = useState("idle");
  const [sourceError, setSourceError] = useState("");
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);
  const [pendingSourceName, setPendingSourceName] = useState("");
  const [studioSource, setStudioSource] = useState(null);

  const prepareSource = useCallback(async incomingSource => {
    const requestId = uploadRequestRef.current + 1;
    uploadRequestRef.current = requestId;
    setStudioSource(null);
    setSourceDuration(0);
    setSourceError("");
    setSourceUploadProgress(0);
    setSourceFile(null);

    if (!incomingSource) {
      setPendingSourceName("");
      setSourceState("idle");
      return;
    }

    const incomingName =
      incomingSource?.name || incomingSource?.fileName || "viral-studio-source.mp4";
    setPendingSourceName(incomingName);

    if (!(incomingSource instanceof Blob)) {
      const remoteUrl = resolveSourceUrl(incomingSource);
      if (!remoteUrl) {
        setSourceState("failed");
        setSourceError("The selected source has no usable video URL.");
        return;
      }
      setSourceFile(incomingSource);
      setSourceState("validating");
      return;
    }

    setSourceState("uploading");
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Please sign in again before uploading.");
      const token = await user.getIdToken();
      const uploadResult = await uploadSourceFileViaBackend({
        file: incomingSource,
        token,
        mediaType: "video",
        fileName: incomingName,
        onProgress: (transferred, total) => {
          if (uploadRequestRef.current !== requestId) return;
          const progress = total > 0 ? Math.round((transferred / total) * 100) : 0;
          setSourceUploadProgress(Math.max(0, Math.min(100, progress)));
        },
      });

      if (uploadRequestRef.current !== requestId) return;
      if (!uploadResult?.url) {
        throw new Error("The upload completed without a usable video URL.");
      }

      setSourceFile({
        name: incomingName,
        fileName: incomingName,
        type: incomingSource.type || "video/mp4",
        size: incomingSource.size || uploadResult.size || 0,
        url: uploadResult.url,
        storagePath: uploadResult.storagePath || null,
        isRemote: true,
      });
      setSourceUploadProgress(100);
      setSourceState("validating");
    } catch (error) {
      if (uploadRequestRef.current !== requestId) return;
      setSourceState("failed");
      setSourceError(error?.message || "The source video upload failed.");
    }
  }, []);

  useEffect(() => {
    setSelectedClip(initialClip || null);
    void prepareSource(initialFile || null);
  }, [initialClip, initialFile, prepareSource]);

  useEffect(() => {
    if (!autoOpen || sourceState !== "ready" || !sourceFile) return;
    setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration));
  }, [autoOpen, selectedClip, sourceDuration, sourceFile, sourceState]);

  const previewUrl = resolveSourceUrl(sourceFile);
  const sourceName = useMemo(
    () =>
      sourceFile?.name ||
      sourceFile?.fileName ||
      pendingSourceName ||
      "No source video selected",
    [pendingSourceName, sourceFile]
  );
  const sourceStateMessage = useMemo(() => {
    if (sourceState === "uploading") {
      return `Uploading source video… ${sourceUploadProgress}%`;
    }
    if (sourceState === "validating") {
      return "Validating the uploaded video preview…";
    }
    if (sourceState === "failed") {
      return sourceError || "The selected video could not be loaded.";
    }
    if (sourceState === "ready") {
      return selectedClip
        ? `${Number(selectedClip.start || 0).toFixed(1)}s–${Number(
            selectedClip.end || 0
          ).toFixed(1)}s detected moment selected`
        : "Full source uploaded and ready for manual editing";
    }
    return "Select a source to begin";
  }, [selectedClip, sourceError, sourceState, sourceUploadProgress]);

  if (studioSource) {
    return (
      <VideoEditor
        file={studioSource}
        onCancel={() => {
          setStudioSource(null);
          onBack?.();
        }}
        onSave={renderedFile => {
          setStudioSource(null);
          onOpenPublisher?.(renderedFile, selectedClip);
        }}
      />
    );
  }

  return (
    <section className="find-viral-clips-panel viral-studio-entry-panel">
      {onBack ? (
        <button type="button" className="btn-secondary clip-studio-back" onClick={onBack}>
          ← Back to discovery
        </button>
      ) : null}
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
                disabled={sourceState === "uploading"}
                onChange={event => {
                  const [file] = Array.from(event.target.files || []);
                  event.target.value = "";
                  if (!file) return;
                  setSelectedClip(null);
                  void prepareSource(file);
                }}
              />
            </label>
          </div>

          <div className={`viral-source-preview ${previewUrl ? "has-video" : ""}`}>
            {previewUrl ? (
              <SafeVideo
                src={previewUrl}
                controls
                preload="metadata"
                onLoadedMetadata={event => {
                  const duration = Number(event.currentTarget.duration || 0);
                  if (!Number.isFinite(duration) || duration <= 0) {
                    setSourceState("failed");
                    setSourceError("The uploaded file has no readable video duration.");
                    return;
                  }
                  setSourceDuration(duration);
                  setSourceError("");
                  setSourceState("ready");
                }}
                onError={() => {
                  setSourceState("failed");
                  setSourceError(
                    "The uploaded video could not be played. Choose a valid MP4 or MOV file and retry."
                  );
                }}
              />
            ) : (
              <div className="viral-source-empty">
                <span>{sourceState === "uploading" ? "↑" : "▶"}</span>
                <strong>
                  {sourceState === "uploading"
                    ? "Uploading the real source video"
                    : sourceState === "failed"
                      ? "Video source not loaded"
                      : "Open the full timeline editor"}
                </strong>
                <small>
                  {sourceState === "uploading"
                    ? `Keep this page open · ${sourceUploadProgress}%`
                    : sourceError ||
                      "Use a detected moment or start manually from a finished video"}
                </small>
              </div>
            )}
          </div>

          <div className="viral-source-meta">
            <span aria-hidden="true">▣</span>
            <div>
              <strong>{sourceName}</strong>
              <small role={sourceState === "failed" ? "alert" : "status"}>
                {sourceStateMessage}
              </small>
            </div>
          </div>
        </article>

        <aside className="viral-settings-card">
          <div className="viral-card-heading">
            <div>
              <span>Clip Studio</span>
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
            disabled={!sourceFile || sourceState !== "ready"}
            onClick={() => {
              if (!canUseFeature("viralClipStudio")) {
                onUpgrade?.();
                return;
              }
              setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration));
            }}
          >
            {sourceState === "uploading"
              ? `Uploading source ${sourceUploadProgress}%`
              : sourceState === "validating"
                ? "Checking video preview…"
                : "Open Clip Studio"}
          </button>
          <small className="viral-settings-note">
            Open the full timeline editor and keep the existing render pipeline.
          </small>
        </aside>
      </div>
    </section>
  );
}

export default ViralClipStudioPanel;
