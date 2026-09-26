import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoEditor from "../components/VideoEditor";
import { SafeVideo } from "../components/SafeMedia";
import { useSubscription } from "../hooks/useSubscription";
import { sanitizeUrl } from "../utils/security";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import { getMediaAuthToken } from "../utils/mediaAuth";

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
  const retrySourceRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [selectedClip, setSelectedClip] = useState(initialClip);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [sourceState, setSourceState] = useState("idle");
  const [sourceError, setSourceError] = useState("");
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);
  const [pendingSourceName, setPendingSourceName] = useState("");
  const [studioSource, setStudioSource] = useState(null);
  const [additionalSourceFiles, setAdditionalSourceFiles] = useState([]);

  const prepareSource = useCallback(async incomingSource => {
    retrySourceRef.current = incomingSource;
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
      const token = await getMediaAuthToken();
      if (!token) throw new Error("Please sign in again before uploading.");
      const uploadResult = await uploadSourceFileViaBackend({
        file: incomingSource,
        token,
        getToken: forceRefresh => getMediaAuthToken(forceRefresh),
        mediaType: "video",
        fileName: incomingName,
        purpose: "studio_source",
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
    const initialSources = Array.isArray(initialFile) ? initialFile.filter(Boolean) : null;
    setAdditionalSourceFiles(initialSources ? initialSources.slice(1) : []);
    void prepareSource(initialSources ? initialSources[0] || null : initialFile || null);
  }, [initialClip, initialFile, prepareSource]);

  const prepareSelectedVideos = files => {
    const videos = Array.from(files || []).filter(candidate => candidate.type?.startsWith("video/"));
    if (!videos.length) return;
    setSelectedClip(null);
    setAdditionalSourceFiles(videos.slice(1));
    void prepareSource(videos[0]);
  };

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
        initialProjectFiles={additionalSourceFiles}
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
      <div className="viral-clips-workspace creator-studio-entry">
        {sourceState === "idle" && !previewUrl && (
          <label
            className="creator-studio-dropzone"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              prepareSelectedVideos(event.dataTransfer.files);
            }}
          >
            <span className="creator-studio-dropzone-icon">☁️</span>
            <h3>Bring your footage into Studio</h3>
            <p>Choose one video or several scenes and camera takes. The first video opens the editor; the rest appear in your project library.</p>
            <span className="creator-studio-btn">Choose Videos</span>
            <input
              type="file"
              accept="video/*"
              multiple
              disabled={sourceState === "uploading"}
              onChange={event => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                prepareSelectedVideos(files);
              }}
            />
          </label>
        )}

        {(sourceState === "uploading" || sourceState === "validating") && (
          <div className="progress-modal-overlay">
            <div className="progress-modal" role="status" aria-live="polite">
              <div className="circular-progress" style={{ "--progress": sourceUploadProgress }}>
                <span>{sourceUploadProgress}%</span>
              </div>
              <h3>{sourceState === "uploading" ? "Uploading video..." : "Validating preview..."}</h3>
              <p>Please keep this page open.</p>
            </div>
          </div>
        )}

        {sourceState === "failed" && (
          <div className="progress-modal-overlay">
            <div className="progress-modal amber-error-overlay" role="alert">
              <div className="circular-progress">
                <span>⚠️</span>
              </div>
              <h3>Source could not be loaded</h3>
              <p>{sourceError || "Video source could not be loaded."}</p>
              <button className="retry-btn" onClick={() => void prepareSource(retrySourceRef.current)}>Retry Upload</button>
              <button type="button" onClick={() => {
                setAdditionalSourceFiles([]);
                void prepareSource(null);
              }}>Choose other videos</button>
            </div>
          </div>
        )}

        {previewUrl && (sourceState === "ready" || sourceState === "validating") && (
          <div className="creator-studio-preview-card" style={{ display: sourceState === "ready" ? "flex" : "none", flexDirection: "column", gap: "16px", background: "var(--studio-panel-bg)", padding: "24px", borderRadius: "24px", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: "400px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--ap-border-strong)" }}>
              <SafeVideo
                src={previewUrl}
                controls
                preload="metadata"
                style={{ width: "100%", display: "block" }}
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
                  setSourceError("The uploaded video could not be played. Choose a valid MP4 or MOV file and retry.");
                }}
              />
            </div>

            <div style={{ textAlign: "center" }}>
              <h3 style={{ margin: "0 0 8px 0" }}>{sourceName}</h3>
              <p style={{ margin: "0 0 24px 0", color: "var(--ap-muted)" }}>{sourceStateMessage}</p>
              {additionalSourceFiles.length > 0 ? (
                <p>{additionalSourceFiles.length} more video{additionalSourceFiles.length === 1 ? "" : "s"} will import into your project library when Studio opens.</p>
              ) : null}
              <button
                type="button"
                className="creator-studio-btn"
                style={{ pointerEvents: "auto", cursor: "pointer", fontSize: "1.1rem" }}
                disabled={sourceState !== "ready"}
                onClick={() => {
                  if (!canUseFeature("viralClipStudio")) {
                    onUpgrade?.();
                    return;
                  }
                  setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration));
                }}
              >
                Open Creator Studio
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default ViralClipStudioPanel;
