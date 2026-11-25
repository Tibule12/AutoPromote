import EducationStudioGuide from "../education/EducationStudioGuide";
import { requestedEducationLesson, createEducationPracticeProject } from "../education/educationStudioPractice";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import VideoEditor from "../components/VideoEditor";
import { SafeVideo } from "../components/SafeMedia";
import { useSubscription } from "../hooks/useSubscription";
import { sanitizeUrl } from "../utils/security";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import { getMediaAuthToken } from "../utils/mediaAuth";
import { API_BASE_URL } from "../config";
import { listViralStudioProjects, saveViralStudioProject } from "../components/viralStudioProjectStore";
import { readStudioProjectBackup } from "../components/studioProjectBackup";
import { studioSourceLeaseRefreshDelay, studioSourceStoragePath } from '../components/studioSourceAccess';

const resolveSourceUrl = source => {
  if (typeof source === "string") return sanitizeUrl(source);
  return source?.url ? sanitizeUrl(source.url) : "";
};

const currentProjectOwnerUid = () => {
  try {
    return getAuth().currentUser?.uid || null;
  } catch {
    return null;
  }
};

const renewSourceRead = async source => {
  const storagePath = studioSourceStoragePath(source);
  if (!storagePath) throw new Error('This video has no saved source to refresh. Choose the original file again.');
  const token = await getMediaAuthToken();
  if (!token) throw new Error('Sign in to refresh access to this video.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/media/studio-assets/resolve`, {
      method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({storagePath}), signal:controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.message || 'Could not refresh access to this video.');
    return {...(typeof source === 'object' ? source : {}),url:result.url,storagePath,isRemote:true};
  } finally { clearTimeout(timer); }
};

const createStudioSource = (sourceFile, clip, sourceDuration, moments = null) => {
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
  // Keep the selected moment first for the ordinary editor's initial focus,
  // while retaining the other detected ranges from this same source in Moments.
  const studioClips = [studioClip, ...(clip && Array.isArray(moments) ? moments : [])
    .filter(item => item && item.id !== clip?.id && Number.isFinite(item.start) &&
      Number.isFinite(item.end) && item.start >= 0 && item.end > item.start)
    .map(item => ({ ...item, duration: item.end - item.start,
      viralScore: item.score || item.viralScore || 0 }))];

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
    studioFile.clips = studioClips;
    return studioFile;
  }

  if (sourceFile && typeof sourceFile === "object") {
    return {
      ...sourceFile,
      isRemote: Boolean(sourceFile.isRemote || sourceFile.url),
      openStudio: true,
      clips: studioClips,
    };
  }

  return {
    name: "viral-studio-source.mp4",
    type: "video/mp4",
    url: typeof sourceFile === "string" ? sourceFile : "",
    isRemote: true,
    openStudio: true,
    clips: studioClips,
  };
};

const savedProjectSummary = project => {
  const snapshot = project.snapshot || {};
  const source = [...(snapshot.projectMedia || []), ...(snapshot.timeline || [])]
    .find(item => item?.name || item?.fileName);
  const sourceName = source?.name || source?.fileName || "Saved video project";
  const generic = !project.name || /^(Full source video loaded for manual editing|Untitled viral edit|Untitled project)$/i.test(project.name.trim());
  const name = generic ? sourceName.replace(/\.[a-z0-9]{2,5}$/i, "") : project.name;
  const updated = Number(project.updatedAt || project.createdAt);
  const date = Number.isFinite(updated) && updated > 0
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(updated))
    : "Saved on this device";
  return { name, sourceName, date };
};

function ViralClipStudioPanel({
  initialFile = null,
  initialClip = null,
  initialClips = null,
  autoOpen = false,
  onBack,
  onOpenPublisher,
  onUpgrade,
}) {
  const { canUseFeature, loading: subscriptionLoading } = useSubscription();
  const ownerUid = currentProjectOwnerUid();
  const listSavedProjects = useCallback(
    () => listViralStudioProjects(ownerUid ? { ownerUid } : undefined),
    [ownerUid]
  );
  const uploadRequestRef = useRef(0);
  const retrySourceRef = useRef(null);
  const sourceReadRetryRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [selectedClip, setSelectedClip] = useState(initialClip);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [sourceState, setSourceState] = useState("idle");
  const [sourceError, setSourceError] = useState("");
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);
  const [pendingSourceName, setPendingSourceName] = useState("");
  const [studioSource, setStudioSource] = useState(null);
  const [additionalSourceFiles, setAdditionalSourceFiles] = useState([]);
  const [storedProjects, setSavedProjects] = useState([]);
  const savedProjects = storedProjects.filter(project => !project.ownerUid || project.ownerUid === ownerUid);
  const [savedProjectsError, setSavedProjectsError] = useState("");
  const [resumedProject, setResumedProject] = useState(null);
  const [resumingProject, setResumingProject] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [preparingLogoCanvas, setPreparingLogoCanvas] = useState(false);
  const [practiceLesson] = useState(() => requestedEducationLesson());
  const [practiceArmed, setPracticeArmed] = useState(false);

  const restoreBackup = async file => {
    if (!file || restoringBackup || subscriptionLoading) return;
    if (!canUseFeature("viralClipStudio")) { onUpgrade?.(); return; }
    setRestoringBackup(true);
    setSavedProjectsError("");
    try {
      const { project, mediaPaths } = await readStudioProjectBackup(file);
      const existing = await listSavedProjects();
      if (existing.some(item => item.id === project.id)) throw new Error("This project is already saved. Open its saved entry.");
      const token = await getMediaAuthToken();
      if (!token) throw new Error("Sign in to restore your project backup.");
      // Bound parallel ownership checks so large saved projects do not wait
      // for every independent Storage lookup in series. Save only after all pass.
      for (let offset = 0; offset < mediaPaths.length; offset += 4) {
        await Promise.all(mediaPaths.slice(offset, offset + 4).map(async storagePath => {
          const response = await fetch(`${API_BASE_URL}/api/media/studio-assets/resolve`, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ storagePath }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) throw new Error(result.message || "A backup source is unavailable to this account.");
        }));
      }
      if (currentProjectOwnerUid() !== ownerUid) throw new Error("The signed-in account changed. Restore the backup again.");
      await saveViralStudioProject(project, { ownerUid, createOnly: true });
      const projects = await listSavedProjects();
      if (currentProjectOwnerUid() === ownerUid) setSavedProjects(projects);
    } catch (error) {
      setSavedProjectsError(error.message || "Project backup could not be restored.");
    } finally { setRestoringBackup(false); }
  };

  useEffect(() => {
    let active = true;
    listSavedProjects().then(projects => {
      if (active && currentProjectOwnerUid() === ownerUid) {
        setSavedProjects(projects);
        setSavedProjectsError("");
      }
    }).catch(error => {
      console.warn("Could not load saved Studio projects", error);
      if (active) setSavedProjectsError("Saved projects could not be loaded. Retry to reopen your edits.");
    });
    return () => { active = false; };
  }, [listSavedProjects, ownerUid]);

  const resumeSavedProject = async project => {
    if (subscriptionLoading) return;
    if (!canUseFeature("viralClipStudio")) {
      onUpgrade?.();
      return;
    }
    setResumingProject(true);
    setSourceError("");
    try {
      const snapshot = project.snapshot;
      const sources = [...(snapshot?.projectMedia || []), ...(snapshot?.timeline || [])];
      const source = sources.find(item => item.storagePath || item.sourceStoragePath);
      const storagePath = source?.storagePath || source?.sourceStoragePath;
      if (!storagePath) throw new Error("This saved project has no saved source video. Open its original video first.");
      const token = await getMediaAuthToken();
      if (!token) throw new Error("Sign in to reopen saved videos.");
      const response = await fetch(`${API_BASE_URL}/api/media/studio-assets/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.message || result.error || "Saved video is unavailable.");
      if (currentProjectOwnerUid() !== ownerUid) return;
      const clip = (snapshot.orderedClips || [])[0];
      const restoredSource = { ...source, url: result.url, storagePath, isRemote: true };
      setResumedProject(project);
      setStudioSource(createStudioSource(restoredSource, clip, source.duration));
    } catch (error) {
      setSourceError(error.message || "Saved project could not be reopened.");
    } finally {
      setResumingProject(false);
    }
  };

  const prepareSource = useCallback(async incomingSource => {
    retrySourceRef.current = incomingSource;
    const requestId = uploadRequestRef.current + 1;
    uploadRequestRef.current = requestId;
    sourceReadRetryRef.current = null;
    setStudioSource(null);
    setResumedProject(null);
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
      setSourceState("validating");
      try {
        let prepared = incomingSource;
        const storagePath = studioSourceStoragePath(incomingSource);
        if (storagePath && studioSourceLeaseRefreshDelay(remoteUrl) === 0) {
          prepared = await renewSourceRead(incomingSource);
        }
        if (uploadRequestRef.current === requestId) setSourceFile(prepared);
      } catch (error) {
        if (uploadRequestRef.current !== requestId) return;
        setSourceState('failed'); setSourceError(error.message || 'Could not load this saved video.');
      }
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

      let prepared = {
        name: incomingName,
        fileName: incomingName,
        type: incomingSource.type || "video/mp4",
        size: incomingSource.size || uploadResult.size || 0,
        url: uploadResult.url,
        storagePath: uploadResult.storagePath || null,
        ...(uploadResult.contentHash || uploadResult.sha256 ? {contentHash: uploadResult.contentHash || uploadResult.sha256} : {}),
        isRemote: true,
      };
      if (studioSourceLeaseRefreshDelay(prepared.url) === 0) prepared = await renewSourceRead(prepared);
      if (uploadRequestRef.current !== requestId) return;
      setSourceFile(prepared);
      setSourceUploadProgress(100);
      setSourceState("validating");
    } catch (error) {
      if (uploadRequestRef.current !== requestId) return;
      setSourceState("failed");
      setSourceError(error?.message || "The source video upload failed.");
    }
  }, []);

  const recoverSourceRead = async failedUrl => {
    const requestId = uploadRequestRef.current;
    if (resolveSourceUrl(sourceFile) !== failedUrl) return;
    const storagePath = studioSourceStoragePath(sourceFile);
    if (!storagePath || sourceReadRetryRef.current === requestId) {
      setSourceState('failed');
      setSourceError('The uploaded video could not be loaded. Retry access or choose another video.');
      return;
    }
    sourceReadRetryRef.current = requestId;
    setSourceFile(null); setSourceState('validating');
    try {
      const prepared = await renewSourceRead(sourceFile);
      if (uploadRequestRef.current !== requestId) return;
      setSourceFile(prepared);
    } catch (error) {
      if (uploadRequestRef.current !== requestId) return;
      setSourceState('failed'); setSourceError(error.message || 'Could not refresh access to this video.');
    }
  };

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

  const startLogoCanvas = async () => {
    if (subscriptionLoading || preparingLogoCanvas) return;
    if (!canUseFeature("viralClipStudio")) { onUpgrade?.(); return; }
    const requestId = ++uploadRequestRef.current;
    setPreparingLogoCanvas(true);
    setSourceError("");
    try {
      const response = await fetch(`${process.env.PUBLIC_URL || ""}/studio/blank-logo-canvas.mp4`);
      if (!response.ok) throw new Error("The logo canvas could not be loaded. Please try again.");
      const blob = await response.blob();
      if (uploadRequestRef.current !== requestId) return;
      setSelectedClip(null); setAdditionalSourceFiles([]);
      await prepareSource(new File([blob], "Logo canvas.mp4", { type: "video/mp4" }));
    } catch (error) {
      if (uploadRequestRef.current === requestId) { setSourceError(error.message); setSourceState("failed"); }
    } finally { setPreparingLogoCanvas(false); }
  };

  useEffect(() => {
    if (!autoOpen || sourceState !== "ready" || !sourceFile) return;
    setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration, initialClips));
  }, [autoOpen, selectedClip, sourceDuration, sourceFile, sourceState, initialClips]);

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
        initialSavedProject={resumedProject}
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
      <div className="creator-studio-entry">
        <EducationStudioGuide lesson={practiceLesson} busy={subscriptionLoading || ["uploading", "validating"].includes(sourceState)} onPrepare={async file => {
          if (!canUseFeature("viralClipStudio")) { onUpgrade?.(); return; }
          setPracticeArmed(true); setSelectedClip(null); setAdditionalSourceFiles([]); await prepareSource(file);
        }} />
        <div className="studio-entry-main">
          <div className="studio-entry-section-heading">
            <span className="studio-entry-eyebrow">START CREATING</span>
            <h3>Your next edit starts here</h3>
            <p>Bring in your footage. Shape the story. Make it yours.</p>
          </div>
        {sourceState === "idle" && !previewUrl && (
          <label
            className="creator-studio-dropzone"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              prepareSelectedVideos(event.dataTransfer.files);
            }}
          >
            <span className="creator-studio-dropzone-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none"><path d="M24 31V12m0 0-7 7m7-7 7 7M12 30v7a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3v-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <h3>Drop your videos here</h3>
            <p>Start with one video or bring several scenes and camera takes.</p>
            <span className="creator-studio-btn">Choose videos <span aria-hidden="true">↗</span></span>
            <small>Video files · Multiple clips welcome</small>
            <input
              type="file"
              accept="video/*"
              aria-label="Choose videos for Studio"
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
                onError={() => void recoverSourceRead(previewUrl)}
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
                disabled={sourceState !== "ready" || subscriptionLoading}
                onClick={() => {
                  if (!canUseFeature("viralClipStudio")) {
                    onUpgrade?.();
                    return;
                  }
                  if (practiceArmed && practiceLesson) {
                    try { setResumedProject(createEducationPracticeProject(practiceLesson, sourceFile, sourceDuration)); }
                    catch (error) { setSourceError(error.message); return; }
                  }
                  setStudioSource(createStudioSource(sourceFile, selectedClip, sourceDuration, initialClips));
                }}
              >
                Open Creator Studio
              </button>
            </div>
          </div>
        )}
          <div className="studio-entry-workflow" aria-label="Studio workflow">
            <span><b>01</b> Bring your footage</span>
            <span><b>02</b> Edit on the timeline</span>
            <span><b>03</b> Review & export</span>
          </div>
          <div className="studio-entry-secondary">
            <div className="creator-studio-logo-entry">
              <span className="studio-entry-small-icon" aria-hidden="true">✦</span>
              <div><h3>Start with a logo</h3><p>Design artwork or animate your identity in Logo Workshop.</p></div>
              <button type="button" className="studio-entry-text-action" aria-label={preparingLogoCanvas ? "Preparing logo canvas…" : "Start a logo design"}
                disabled={preparingLogoCanvas || subscriptionLoading || sourceState === "uploading" || sourceState === "validating" || resumingProject || restoringBackup}
                onClick={() => void startLogoCanvas()}>
                {preparingLogoCanvas ? "Preparing…" : "Design a logo"}<span aria-hidden="true">↗</span>
              </button>
            </div>
            <label className="studio-entry-restore">
              <span className="studio-entry-small-icon" aria-hidden="true">↥</span>
              <span><strong>{restoringBackup ? "Restoring project…" : "Restore a project"}</strong><small>Continue from a saved project backup.</small></span>
              <span className="studio-entry-restore-action">Choose backup <span aria-hidden="true">↗</span></span>
              <input type="file" accept="application/json,.json" aria-label="Restore project backup"
                disabled={restoringBackup || subscriptionLoading}
                onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void restoreBackup(file); }} />
            </label>
          </div>
        </div>
        <aside className="studio-entry-projects" aria-label="Saved Studio projects">
          <div className="studio-entry-projects-heading"><div><span className="studio-entry-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h3>Recent projects</h3></div><span className="studio-entry-count">{savedProjects.length}</span></div>
          <p className="studio-entry-device-note">Saved in this browser on this device.</p>
          {savedProjectsError && <div role="alert" className="studio-entry-alert"><p>{savedProjectsError}</p>
            <button type="button" onClick={async () => {
              try {
                const projects = await listSavedProjects();
                if (currentProjectOwnerUid() === ownerUid) {
                  setSavedProjects(projects);
                  setSavedProjectsError("");
                }
              }
              catch (error) { console.warn("Could not reload saved Studio projects", error); }
            }}>Retry saved projects</button>
          </div>}
          {savedProjects.length ? <div className="studio-entry-project-list">{savedProjects.map(project => {
            const summary = savedProjectSummary(project);
            return <button key={project.id} type="button" className="studio-entry-project-card" aria-label={summary.name}
              disabled={resumingProject || subscriptionLoading} onClick={() => void resumeSavedProject(project)}>
              <span className="studio-entry-project-art" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="4" y="5" width="24" height="22" rx="5" stroke="currentColor" strokeWidth="1.5"/><path d="m13 11 8 5-8 5V11Z" fill="currentColor"/></svg></span>
              <span className="studio-entry-project-copy"><strong>{summary.name}</strong><small title={summary.sourceName}>{summary.sourceName}</small><time>{summary.date}</time></span>
              <span className="studio-entry-project-arrow" aria-hidden="true">↗</span>
            </button>;
          })}</div> : <div className="studio-entry-no-projects"><span aria-hidden="true">▣</span><strong>A fresh canvas awaits</strong><p>Your saved edits will appear here. Choose a video to start your first project.</p></div>}
          {sourceError && sourceState === "idle" ? <p role="alert" className="studio-entry-alert">{sourceError}</p> : null}
        </aside>
      </div>
    </section>
  );
}

export default ViralClipStudioPanel;
