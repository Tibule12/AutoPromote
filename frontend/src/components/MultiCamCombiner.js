import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildInitialSources,
  buildSwitchDisplaySegments,
  formatDurationLabel,
  getActiveCameraAtTime,
  getMasterTimelineBounds,
  getSourceDurationBounds,
  normalizeSourceLabel,
  normalizeSwitches,
} from "./multicamUtils";
import "./MultiCamCombiner.css";

const DRIFT_THRESHOLD_SECONDS = 0.18;
const EXPORT_FRAME_RATE = 30;

const getSourceMediaUrl = source => source?.previewUrl || source?.url || source?.uploadedUrl || "";

const getSourceTimelineTime = (source, playhead, timelineStart) => {
  const offsetSeconds = Number(source?.offsetSeconds) || 0;
  return playhead + timelineStart - offsetSeconds;
};

const loadVideoMetadata = mediaUrl =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = mediaUrl;
    video.onloadedmetadata = () => {
      resolve({
        duration: Number(video.duration) || 0,
        videoWidth: Number(video.videoWidth) || 0,
        videoHeight: Number(video.videoHeight) || 0,
      });
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => reject(new Error("Failed to read video metadata"));
  });

const syncMediaElement = (element, desiredTime, shouldPlay, options = {}) => {
  if (!element) return;

  const {
    muted = true,
    volume = 0,
    driftThreshold = DRIFT_THRESHOLD_SECONDS,
    playbackRate = 1,
  } = options;

  element.muted = muted;
  element.volume = volume;
  element.playbackRate = playbackRate;

  const safeTime = Math.max(0, Number(desiredTime) || 0);
  if (Math.abs((Number(element.currentTime) || 0) - safeTime) > driftThreshold) {
    try {
      element.currentTime = safeTime;
    } catch {
      return;
    }
  }

  if (shouldPlay) {
    if (element.paused) {
      element.play().catch(() => {});
    }
    return;
  }

  if (!element.paused) {
    element.pause();
  }
};

const drawVideoToCanvas = (context, canvas, activeVideo, label) => {
  context.fillStyle = "#04070d";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (activeVideo && activeVideo.readyState >= 2) {
    const sourceWidth = activeVideo.videoWidth || canvas.width;
    const sourceHeight = activeVideo.videoHeight || canvas.height;
    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;
    context.drawImage(activeVideo, offsetX, offsetY, drawWidth, drawHeight);
    return;
  }

  context.fillStyle = "rgba(255, 255, 255, 0.75)";
  context.font = `${Math.max(24, Math.round(canvas.width * 0.028))}px sans-serif`;
  context.textAlign = "center";
  context.fillText(label || "No active camera frame", canvas.width / 2, canvas.height / 2);
};

const pickExportMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || "";
};

function MultiCamCombiner({ primaryFile, onCancel, onComplete, onStatusChange }) {
  const [sources, setSources] = useState(() =>
    buildInitialSources(primaryFile).map((source, index) => ({
      ...source,
      id: source.id || `cam-${index + 1}`,
      label: normalizeSourceLabel(source.label, index),
      name: source.file?.name || normalizeSourceLabel(source.label, index),
      videoWidth: 0,
      videoHeight: 0,
    }))
  );
  const [switches, setSwitches] = useState([{ id: "switch-1", cameraId: "cam-1", startTime: 0 }]);
  const [masterAudioCameraId, setMasterAudioCameraId] = useState("cam-1");
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSwitchId, setSelectedSwitchId] = useState("switch-1");
  const [statusMessage, setStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState(null);

  const fileInputRef = useRef(null);
  const nextCameraIndexRef = useRef(3);
  const objectUrlsRef = useRef(new Set());
  const animationFrameRef = useRef(null);
  const playheadRef = useRef(0);
  const previewVideoRefs = useRef({});
  const thumbnailVideoRefs = useRef({});
  const audioVideoRefs = useRef({});

  const readySources = useMemo(
    () => sources.filter(source => getSourceMediaUrl(source) && Number(source.duration) > 0.05),
    [sources]
  );

  const timelineBounds = useMemo(() => getMasterTimelineBounds(readySources), [readySources]);
  const overlapBounds = useMemo(() => getSourceDurationBounds(readySources), [readySources]);
  const timelineDuration = timelineBounds.timelineDuration;
  const normalizedSwitches = useMemo(
    () =>
      normalizeSwitches(
        switches,
        readySources.length ? readySources : sources,
        timelineDuration || 0
      ),
    [readySources, sources, switches, timelineDuration]
  );
  const displaySegments = useMemo(
    () =>
      buildSwitchDisplaySegments(
        normalizedSwitches,
        readySources.length ? readySources : sources,
        timelineDuration || 0.01
      ),
    [normalizedSwitches, readySources, sources, timelineDuration]
  );
  const activeSegment = useMemo(
    () =>
      getActiveCameraAtTime(
        normalizedSwitches,
        readySources.length ? readySources : sources,
        playhead,
        timelineDuration || 0.01
      ),
    [normalizedSwitches, readySources, sources, playhead, timelineDuration]
  );

  const activeCameraId = activeSegment?.cameraId || readySources[0]?.id || sources[0]?.id || null;
  const activeCamera = readySources.find(source => source.id === activeCameraId) || null;
  const masterAudioSource = readySources.find(source => source.id === masterAudioCameraId) || null;

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    if (!readySources.length) return;
    if (!readySources.some(source => source.id === masterAudioCameraId)) {
      setMasterAudioCameraId(readySources[0].id);
    }
  }, [readySources, masterAudioCameraId]);

  useEffect(() => {
    if (!timelineDuration) {
      if (playhead !== 0) setPlayhead(0);
      if (isPlaying) setIsPlaying(false);
      return;
    }
    if (playhead > timelineDuration) {
      setPlayhead(timelineDuration);
    }
  }, [playhead, timelineDuration, isPlaying]);

  useEffect(() => {
    const unresolvedSources = sources.filter(
      source => getSourceMediaUrl(source) && Number(source.duration) <= 0.05
    );
    if (!unresolvedSources.length) return;

    let isCancelled = false;
    unresolvedSources.forEach(source => {
      loadVideoMetadata(getSourceMediaUrl(source))
        .then(metadata => {
          if (isCancelled) return;
          setSources(currentSources =>
            currentSources.map(currentSource =>
              currentSource.id === source.id
                ? {
                    ...currentSource,
                    duration: metadata.duration,
                    videoWidth: metadata.videoWidth,
                    videoHeight: metadata.videoHeight,
                  }
                : currentSource
            )
          );
        })
        .catch(() => {
          if (isCancelled) return;
          setStatusMessage(`Unable to read ${source.name || source.label}.`);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [sources]);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(statusMessage);
    }
  }, [statusMessage, onStatusChange]);

  useEffect(() => {
    if (!isPlaying || !timelineDuration) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return undefined;
    }

    const startedAt = performance.now() - playheadRef.current * 1000;
    const tick = now => {
      const nextPlayhead = Math.min(timelineDuration, (now - startedAt) / 1000);
      setPlayhead(nextPlayhead);
      if (nextPlayhead >= timelineDuration) {
        setIsPlaying(false);
        animationFrameRef.current = null;
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, timelineDuration]);

  useEffect(() => {
    readySources.forEach(source => {
      const mappedTime = getSourceTimelineTime(source, playhead, timelineBounds.timelineStart);
      const isInRange = mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;

      syncMediaElement(previewVideoRefs.current[source.id], mappedTime, isPlaying && isInRange, {
        muted: true,
        volume: 0,
      });
      syncMediaElement(thumbnailVideoRefs.current[source.id], mappedTime, isPlaying && isInRange, {
        muted: true,
        volume: 0,
      });
      syncMediaElement(
        audioVideoRefs.current[source.id],
        mappedTime,
        isPlaying && isInRange && source.id === masterAudioCameraId,
        {
          muted: source.id !== masterAudioCameraId,
          volume: source.id === masterAudioCameraId ? 1 : 0,
        }
      );
    });
  }, [readySources, playhead, isPlaying, timelineBounds.timelineStart, masterAudioCameraId]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      if (exportResult?.url) {
        URL.revokeObjectURL(exportResult.url);
      }
    };
  }, [exportResult]);

  const appendFiles = files => {
    const nextSources = Array.from(files || []).map(file => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      const cameraNumber = nextCameraIndexRef.current;
      nextCameraIndexRef.current += 1;
      return {
        id: `cam-${cameraNumber}`,
        label: `Camera ${cameraNumber}`,
        name: file.name,
        file,
        previewUrl,
        url: "",
        uploadedUrl: "",
        offsetSeconds: 0,
        duration: 0,
        videoWidth: 0,
        videoHeight: 0,
      };
    });

    setSources(currentSources => [...currentSources, ...nextSources]);
    if (nextSources.length) {
      setStatusMessage(
        `${nextSources.length} camera source${nextSources.length > 1 ? "s" : ""} added.`
      );
    }
  };

  const handleOffsetChange = (cameraId, nextValue) => {
    const numericOffset = Number(nextValue);
    setSources(currentSources =>
      currentSources.map(source =>
        source.id === cameraId
          ? { ...source, offsetSeconds: Number.isFinite(numericOffset) ? numericOffset : 0 }
          : source
      )
    );
  };

  const handleRecordSwitch = cameraId => {
    if (!cameraId || !timelineDuration) return;

    const switchTime = Number(playhead.toFixed(3));
    setSwitches(currentSwitches => {
      const sourceScope = readySources.length ? readySources : sources;
      const nextSwitches = [...currentSwitches];
      const existingIndex = nextSwitches.findIndex(
        item => Math.abs(Number(item.startTime) - switchTime) < 0.08
      );
      const nextSwitch = {
        id: existingIndex >= 0 ? nextSwitches[existingIndex].id : `switch-${Date.now()}`,
        cameraId,
        startTime: switchTime,
      };

      if (existingIndex >= 0) {
        nextSwitches[existingIndex] = nextSwitch;
      } else {
        nextSwitches.push(nextSwitch);
      }

      const normalized = normalizeSwitches(nextSwitches, sourceScope, timelineDuration);
      const selected = normalized.find(
        item => Math.abs(Number(item.startTime) - switchTime) < 0.08 && item.cameraId === cameraId
      );
      if (selected) {
        setSelectedSwitchId(selected.id);
      }
      return normalized;
    });
  };

  const handleRemoveSwitch = switchId => {
    if (!switchId) return;
    setSwitches(currentSwitches => {
      const sourceScope = readySources.length ? readySources : sources;
      const removableSwitch = currentSwitches.find(item => item.id === switchId);
      if (!removableSwitch || Number(removableSwitch.startTime) <= 0.001) {
        return currentSwitches;
      }

      const normalized = normalizeSwitches(
        currentSwitches.filter(item => item.id !== switchId),
        sourceScope,
        timelineDuration || 0
      );
      setSelectedSwitchId(normalized[0]?.id || null);
      return normalized;
    });
  };

  const handlePlayPause = () => {
    if (!timelineDuration) return;
    if (playhead >= timelineDuration) {
      setPlayhead(0);
    }
    setIsPlaying(currentValue => !currentValue);
  };

  const handleSeek = nextValue => {
    const numericValue = Number(nextValue);
    setPlayhead(Number.isFinite(numericValue) ? numericValue : 0);
  };

  const handleUseExportInEditor = () => {
    if (!exportResult || !onComplete) return;
    onComplete({
      file: exportResult.file,
      url: exportResult.url,
      duration: exportResult.duration,
      workflowAction: "refine-full-video",
    });
  };

  const handleExport = async () => {
    if (readySources.length < 2) {
      setStatusMessage("Load at least two video sources before exporting.");
      return;
    }
    if (!timelineDuration || !activeCameraId || !masterAudioSource) {
      setStatusMessage("Set up synced sources and a master audio camera before exporting.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatusMessage("This browser does not support in-browser video export.");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setStatusMessage("Rendering browser-based multicam master...");

    const exportVideos = new Map();
    let recorder;
    let recorderStream;
    let audioContext;
    let audioDestination;

    try {
      await Promise.all(
        readySources.map(async source => {
          const video = document.createElement("video");
          video.src = getSourceMediaUrl(source);
          video.preload = "auto";
          video.muted = true;
          video.playsInline = true;
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error(`Unable to load ${source.label} for export.`));
          });
          exportVideos.set(source.id, video);
        })
      );

      const baseSource = activeCamera || readySources[0];
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(640, Number(baseSource.videoWidth) || 1080);
      canvas.height = Math.max(360, Number(baseSource.videoHeight) || 1920);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create export canvas.");
      }

      const canvasStream = canvas.captureStream(EXPORT_FRAME_RATE);
      const masterVideo = exportVideos.get(masterAudioCameraId);
      audioContext = new AudioContext();
      await audioContext.resume();
      audioDestination = audioContext.createMediaStreamDestination();

      if (masterVideo) {
        const audioSource = audioContext.createMediaElementSource(masterVideo);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        audioSource.connect(gainNode);
        gainNode.connect(audioDestination);
      }

      recorderStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const chunks = [];
      const mimeType = pickExportMimeType();
      recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      };

      const completion = new Promise(resolve => {
        recorder.onstop = resolve;
      });

      recorder.start(250);

      await new Promise(resolve => {
        const startedAt = performance.now();
        const renderFrame = now => {
          const exportPlayhead = Math.min(timelineDuration, (now - startedAt) / 1000);
          setExportProgress(exportPlayhead / timelineDuration);

          readySources.forEach(source => {
            const video = exportVideos.get(source.id);
            const mappedTime = getSourceTimelineTime(
              source,
              exportPlayhead,
              timelineBounds.timelineStart
            );
            const isInRange = mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
            syncMediaElement(video, mappedTime, isInRange, {
              muted: true,
              volume: 0,
              driftThreshold: 0.24,
            });
          });

          const currentSegment = getActiveCameraAtTime(
            normalizedSwitches,
            readySources,
            exportPlayhead,
            timelineDuration
          );
          const currentCameraLabel = readySources.find(
            source => source.id === currentSegment?.cameraId
          )?.label;
          drawVideoToCanvas(
            context,
            canvas,
            exportVideos.get(currentSegment?.cameraId),
            currentCameraLabel
          );

          if (exportPlayhead >= timelineDuration) {
            recorder.stop();
            resolve();
            return;
          }

          requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);
      });

      await completion;
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const exportUrl = URL.createObjectURL(blob);
      const exportFile = new File([blob], `multicam-master-${Date.now()}.webm`, {
        type: blob.type || "video/webm",
      });

      if (exportResult?.url) {
        URL.revokeObjectURL(exportResult.url);
      }

      setExportResult({
        url: exportUrl,
        file: exportFile,
        duration: timelineDuration,
      });
      setStatusMessage("Browser render complete. Download the master or continue into the editor.");
    } catch (error) {
      console.error(error);
      setStatusMessage(error.message || "Browser export failed.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      exportVideos.forEach(video => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      if (recorderStream) {
        recorderStream.getTracks().forEach(track => track.stop());
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
    }
  };

  return (
    <div
      className="nle-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Combine Multi-Camera Studio"
    >
      <div className="nle-shell">
        <div className="nle-header">
          <div className="nle-header-copy">
            <span className="nle-eyebrow">Multicam Studio</span>
            <h3>Combine Multi-Camera Angles</h3>
            <p>
              Load separate camera recordings, line them up on one shared timeline, choose one
              master audio lane, and switch visible angles like a live cut.
            </p>
          </div>
          <button
            className="nle-close-btn"
            type="button"
            onClick={onCancel}
            aria-label="Close multicam studio"
          >
            &times;
          </button>
        </div>

        <div className="nle-summary-row">
          <div className="nle-summary-card">
            <span>Sources</span>
            <strong>{readySources.length}</strong>
          </div>
          <div className="nle-summary-card">
            <span>Master Audio</span>
            <strong>{masterAudioSource?.label || "Not set"}</strong>
          </div>
          <div className="nle-summary-card">
            <span>Shared Timeline</span>
            <strong>{formatDurationLabel(timelineDuration || 0)}</strong>
          </div>
        </div>

        <div className="nle-container">
          <div className="nle-preview-panel">
            <div className="nle-preview-stage">
              {readySources.map(source => (
                <video
                  key={`preview-${source.id}`}
                  ref={node => {
                    previewVideoRefs.current[source.id] = node;
                  }}
                  className={`nle-preview-video ${source.id === activeCameraId ? "is-active" : ""}`}
                  src={getSourceMediaUrl(source)}
                  playsInline
                  muted
                />
              ))}
              {!readySources.length ? (
                <div className="nle-empty-state">
                  <strong>Add at least two camera recordings.</strong>
                  <span>
                    The primary video is preloaded. Add more cameras below to start syncing.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="nle-preview-toolbar">
              <button
                className="nle-btn secondary"
                type="button"
                onClick={handlePlayPause}
                disabled={!timelineDuration}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <div className="nle-seek-block">
                <input
                  type="range"
                  min="0"
                  max={timelineDuration || 0}
                  step="0.01"
                  value={Math.min(playhead, timelineDuration || 0)}
                  onChange={event => handleSeek(event.target.value)}
                  disabled={!timelineDuration}
                />
                <div className="nle-time-row">
                  <span>{formatDurationLabel(playhead)}</span>
                  <span>{formatDurationLabel(timelineDuration || 0)}</span>
                </div>
              </div>
              <div className="nle-preview-badges">
                <span className="nle-chip">Active video: {activeCamera?.label || "None"}</span>
                <span className="nle-chip nle-chip-secondary">
                  Master audio: {masterAudioSource?.label || "None"}
                </span>
              </div>
            </div>
          </div>

          <div className="nle-panel nle-camera-panel">
            <div className="nle-panel-header">
              <div>
                <h4>Camera Sources</h4>
                <p>
                  Every camera plays against the same timeline. Offsets move the source, not the cut
                  list.
                </p>
              </div>
              <div className="nle-panel-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  onChange={event => {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="nle-hidden-input"
                />
                <button
                  className="nle-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add Camera Files
                </button>
              </div>
            </div>

            <div className="nle-camera-grid">
              {sources.map((source, index) => {
                const mediaUrl = getSourceMediaUrl(source);
                const mappedTime = getSourceTimelineTime(
                  source,
                  playhead,
                  timelineBounds.timelineStart
                );
                const isAvailable =
                  mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
                return (
                  <article
                    key={source.id}
                    className={`nle-camera-card ${source.id === activeCameraId ? "is-active" : ""}`}
                  >
                    <div className="nle-camera-header">
                      <div>
                        <strong>{normalizeSourceLabel(source.label, index)}</strong>
                        <span>{source.name || normalizeSourceLabel(source.label, index)}</span>
                      </div>
                      <span className={`nle-camera-badge ${isAvailable ? "is-live" : ""}`}>
                        {isAvailable ? "In sync" : "Off timeline"}
                      </span>
                    </div>
                    <div className="nle-thumbnail-shell">
                      {mediaUrl ? (
                        <video
                          ref={node => {
                            thumbnailVideoRefs.current[source.id] = node;
                          }}
                          className="nle-thumbnail-video"
                          src={mediaUrl}
                          playsInline
                          muted
                        />
                      ) : (
                        <div className="nle-thumbnail-placeholder">No video loaded</div>
                      )}
                    </div>
                    <div className="nle-field-grid">
                      <label className="nle-field-block">
                        <span>Offset Seconds</span>
                        <input
                          className="nle-input"
                          type="number"
                          step="0.05"
                          value={Number(source.offsetSeconds) || 0}
                          onChange={event => handleOffsetChange(source.id, event.target.value)}
                        />
                      </label>
                      <label className="nle-field-block nle-radio-block">
                        <span>Master Audio</span>
                        <input
                          type="radio"
                          checked={masterAudioCameraId === source.id}
                          onChange={() => setMasterAudioCameraId(source.id)}
                          disabled={!mediaUrl}
                        />
                      </label>
                    </div>
                    <div className="nle-source-meta-row">
                      <span>Duration: {formatDurationLabel(source.duration || 0)}</span>
                      <span>
                        Source Time: {isAvailable ? formatDurationLabel(mappedTime) : "--"}
                      </span>
                    </div>
                    <div className="nle-camera-actions">
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() => handleRecordSwitch(source.id)}
                        disabled={!timelineDuration}
                      >
                        Cut To {normalizeSourceLabel(source.label, index)}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="nle-panel nle-switch-panel">
            <div className="nle-panel-header">
              <div>
                <h4>Switch Timeline</h4>
                <p>
                  Camera buttons write switch events. Audio stays on the selected master source
                  throughout.
                </p>
              </div>
              <div className="nle-panel-actions nle-switch-buttons">
                {readySources.map((source, index) => (
                  <button
                    key={`switch-btn-${source.id}`}
                    className={`nle-btn ${source.id === activeCameraId ? "secondary" : ""}`}
                    type="button"
                    onClick={() => handleRecordSwitch(source.id)}
                    disabled={!timelineDuration}
                  >
                    {normalizeSourceLabel(source.label, index)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="nle-switch-track"
              onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                const nextPlayhead =
                  ((event.clientX - rect.left) / rect.width) * (timelineDuration || 0);
                handleSeek(nextPlayhead);
              }}
            >
              {displaySegments.map(segment => (
                <button
                  key={segment.id}
                  type="button"
                  className={`nle-switch-segment ${selectedSwitchId === segment.id ? "is-selected" : ""}`}
                  style={{ left: `${segment.startPercent}%`, width: `${segment.widthPercent}%` }}
                  onClick={event => {
                    event.stopPropagation();
                    setSelectedSwitchId(segment.id);
                    handleSeek(segment.startTime);
                  }}
                >
                  <span>{segment.label}</span>
                </button>
              ))}
              <div
                className="nle-playhead-marker-inline"
                style={{ left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%` }}
              />
            </div>

            <div className="nle-switch-list">
              {normalizedSwitches.map((switchItem, index) => {
                const label =
                  readySources.find(source => source.id === switchItem.cameraId)?.label ||
                  switchItem.cameraId;
                const isLocked = Number(switchItem.startTime) <= 0.001;
                return (
                  <div
                    key={switchItem.id}
                    className={`nle-switch-row ${selectedSwitchId === switchItem.id ? "is-selected" : ""}`}
                  >
                    <button
                      className="nle-text-btn"
                      type="button"
                      onClick={() => {
                        setSelectedSwitchId(switchItem.id);
                        handleSeek(switchItem.startTime);
                      }}
                    >
                      {index + 1}. {label} at {formatDurationLabel(switchItem.startTime)}
                    </button>
                    <button
                      className="nle-btn secondary"
                      type="button"
                      onClick={() => handleRemoveSwitch(switchItem.id)}
                      disabled={isLocked}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="nle-footer-grid">
              <div className="nle-footer-note">
                <strong>Sync window</strong>
                <span>
                  Overlap start {formatDurationLabel(overlapBounds.overlapStart || 0)} | overlap
                  duration {formatDurationLabel(overlapBounds.overlapDuration || 0)}
                </span>
              </div>
              <div className="nle-footer-actions">
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={onCancel}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  className="nle-btn danger"
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || readySources.length < 2 || !timelineDuration}
                >
                  {isExporting ? "Rendering Browser Export..." : "Render Final Video In Browser"}
                </button>
              </div>
            </div>

            {isExporting ? (
              <div className="nle-export-progress">
                <div
                  className="nle-export-progress-bar"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
              </div>
            ) : null}

            {exportResult ? (
              <div className="nle-export-result">
                <strong>Multicam master ready</strong>
                <span>
                  The browser render is available as WebM. Download it or continue into the editor.
                </span>
                <div className="nle-export-actions">
                  <a
                    className="nle-btn secondary"
                    href={exportResult.url}
                    download={exportResult.file.name}
                  >
                    Download Master
                  </a>
                  <button className="nle-btn" type="button" onClick={handleUseExportInEditor}>
                    Use This Master
                  </button>
                </div>
              </div>
            ) : null}

            {statusMessage ? <div className="nle-status-banner">{statusMessage}</div> : null}
          </div>
        </div>

        <div className="nle-hidden-audio-rack" aria-hidden="true">
          {readySources.map(source => (
            <video
              key={`audio-${source.id}`}
              ref={node => {
                audioVideoRefs.current[source.id] = node;
              }}
              src={getSourceMediaUrl(source)}
              playsInline
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MultiCamCombiner;
