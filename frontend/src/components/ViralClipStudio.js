import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { sanitizeUrl } from "../utils/security";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import React, { useState, useRef, useEffect } from "react";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import html2canvas from "html2canvas"; // For rendering styled captions
import "./ViralClipStudio.css"; // We'll create this CSS next

// --- Constants for Viral Styles ---
const GAMEPLAY_OPTIONS = {
  runner: {
    label: "🏎️ Runner (Tux Racer)",
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Tux_Racer_gameplay_(Ingo%27s_Speedway).webm/Tux_Racer_gameplay_(Ingo%27s_Speedway).webm.480p.vp9.webm",
    description: "Fast-paced racing, similar to Subway Surfers.",
  },
  shooter: {
    label: "🔫 Shooter (Red Eclipse)",
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c6/Red_Eclipse_1%2C5_Gameplay_2.webm/Red_Eclipse_1%2C5_Gameplay_2.webm.480p.vp9.webm",
    description: "Action FPS gameplay, similar to CoD/Halo.",
  },
  // Add more here if you find other CC0 clips (e.g. Slime, Parkour)
};

const RAINBOW_COLORS = [
  "#FF9AA2", // Soft Red
  "#FFB7B2", // Salmon
  "#FFDAC1", // Peach
  "#E2F0CB", // Lime Green
  "#B5EAD7", // Mint
  "#C7CEEA", // Lavender
  "#F4C2C2", // Baby Pink
  "#89CFF0", // Baby Blue
];

const normalizePlainText = value =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const clampAudioControl = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const RainbowText = ({ text, offset = 0 }) => {
  const safeText = normalizePlainText(text);
  if (!safeText) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontWeight: "900",
        textShadow: "3px 3px 0 #000", // Thicker outline
        WebkitTextStroke: "1.5px black", // Crisp outline
        fontFamily: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif',
        fontSize: "24px", // Bigger by default
      }}
    >
      {safeText.split("").map((char, index) => (
        <span
          key={index}
          style={{ color: RAINBOW_COLORS[(index + offset) % RAINBOW_COLORS.length] }}
        >
          {char}
        </span>
      ))}
    </span>
  );
};

const sidebarSectionTitleStyle = {
  margin: "0 0 10px 0",
  color: "#111827",
  fontWeight: 800,
};

const sidebarCheckboxLabelStyle = {
  display: "block",
  cursor: "pointer",
  color: "#111827",
  fontWeight: 700,
};

const sidebarBodyTextStyle = {
  fontSize: "13px",
  color: "#1f2937",
  fontWeight: 700,
  lineHeight: 1.45,
};

const sidebarActionButtonStyle = {
  padding: "8px",
  cursor: "pointer",
  background: "white",
  border: "1px solid #ccc",
  borderRadius: "4px",
  color: "#111827",
  fontWeight: 700,
};

const ViralClipStudio = ({
  videoUrl,
  clips,
  images = [],
  onSave,
  onCancel,
  onStatusChange,
  currentMusic,
  onMusicChange,
}) => {
  const [orderedClips, setOrderedClips] = useState(clips || []);
  const [selectedClip, setSelectedClip] = useState((clips || [])[0]);
  const [overlays, setOverlays] = useState([]);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoFit, setVideoFit] = useState("contain"); // 'contain', 'cover' (fill), 'fill' (stretch)

  // New AI Options for users
  const [autoCaptions, setAutoCaptions] = useState(false);
  const [smartCrop, setSmartCrop] = useState(false);
  const [extractedAudio, setExtractedAudio] = useState(null);
  const [audioExtractionStatus, setAudioExtractionStatus] = useState("");
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);

  const [timeline, setTimeline] = useState(() => {
    // Initial timeline is just the main video URL, effectively one clip
    return [{ id: "main", url: videoUrl, duration: 0, startRequest: null, endRequest: null }];
  });
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);
  const [draggedOverlayId, setDraggedOverlayId] = useState(null);
  const [draggedTimelineClipId, setDraggedTimelineClipId] = useState(null);
  const [draggedDetectedClipId, setDraggedDetectedClipId] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null); // Hidden file input
  const imageInputRef = useRef(null);
  const audioSourceInputRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastSnapshotRef = useRef(null);
  const isRestoringHistoryRef = useRef(false);

  const normalizeAssetUrl = asset => {
    if (!asset) return "";
    if (typeof asset === "string") return asset;
    return asset.url || asset.src || asset.downloadURL || asset.mediaUrl || asset.thumbnail || "";
  };

  const cloneSnapshot = snapshot => JSON.parse(JSON.stringify(snapshot));

  const getEditorSnapshot = () => ({
    orderedClips,
    selectedClipId: selectedClip?.id || null,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    extractedAudio,
    timeline,
    activeTimelineIndex,
  });

  const syncHistoryAvailability = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const applyEditorSnapshot = snapshot => {
    const normalizedClips = snapshot.orderedClips || [];
    setOrderedClips(normalizedClips);
    setSelectedClip(
      normalizedClips.find(clip => clip.id === snapshot.selectedClipId) ||
        normalizedClips[0] ||
        null
    );
    setOverlays(snapshot.overlays || []);
    setActiveOverlayId(snapshot.activeOverlayId || null);
    setVideoFit(snapshot.videoFit || "contain");
    setAutoCaptions(!!snapshot.autoCaptions);
    setSmartCrop(!!snapshot.smartCrop);
    setExtractedAudio(snapshot.extractedAudio || null);
    setTimeline(snapshot.timeline || []);
    setActiveTimelineIndex(Math.max(0, Number(snapshot.activeTimelineIndex || 0)));
  };

  const handleUndo = () => {
    if (!undoStackRef.current.length) return;

    const currentSnapshot = cloneSnapshot(getEditorSnapshot());
    const previousSnapshot = undoStackRef.current.pop();
    redoStackRef.current.push(currentSnapshot);
    isRestoringHistoryRef.current = true;
    applyEditorSnapshot(cloneSnapshot(previousSnapshot));
    syncHistoryAvailability();
  };

  const handleRedo = () => {
    if (!redoStackRef.current.length) return;

    const currentSnapshot = cloneSnapshot(getEditorSnapshot());
    const nextSnapshot = redoStackRef.current.pop();
    undoStackRef.current.push(currentSnapshot);
    isRestoringHistoryRef.current = true;
    applyEditorSnapshot(cloneSnapshot(nextSnapshot));
    syncHistoryAvailability();
  };

  const addOverlayAsset = ({
    type,
    src,
    file = null,
    isLocal = false,
    width = 40,
    height = 30,
  }) => {
    if (!src) return;
    const newOverlay = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type,
      src,
      file,
      isLocal,
      x: 50,
      y: 50,
      width,
      height,
      aspectRatioLocked: type === "video" || type === "image",
      aspectRatio: height ? width / height : 1,
      clipId: timeline[activeTimelineIndex]?.id || "main",
    };
    setOverlays(prev => [...prev, newOverlay]);
    setActiveOverlayId(newOverlay.id);
  };

  const clampOverlayDimension = value => Math.max(10, Math.min(100, Number(value) || 10));
  const clampOverlayCoordinate = value => Math.max(0, Math.min(100, Number(value) || 0));

  const getOverlayAspectRatio = overlay => {
    const storedRatio = Number(overlay.aspectRatio);
    if (Number.isFinite(storedRatio) && storedRatio > 0) return storedRatio;

    const width = clampOverlayDimension(overlay.width ?? 40);
    const height = clampOverlayDimension(overlay.height ?? 30);
    return width / height;
  };

  const updateOverlaySize = (id, dimension, delta) => {
    setOverlays(prev =>
      prev.map(overlay => {
        if (overlay.id !== id) return overlay;
        const currentWidth = clampOverlayDimension(overlay.width ?? 40);
        const currentHeight = clampOverlayDimension(overlay.height ?? 30);
        const nextValue = clampOverlayDimension(
          Number(overlay[dimension] ?? (dimension === "width" ? currentWidth : currentHeight)) +
            delta
        );

        if (overlay.aspectRatioLocked && (overlay.type === "video" || overlay.type === "image")) {
          const ratio = getOverlayAspectRatio(overlay);
          if (dimension === "width") {
            return {
              ...overlay,
              width: nextValue,
              height: clampOverlayDimension(nextValue / ratio),
            };
          }

          return {
            ...overlay,
            height: nextValue,
            width: clampOverlayDimension(nextValue * ratio),
          };
        }

        const nextWidth = dimension === "width" ? nextValue : currentWidth;
        const nextHeight = dimension === "height" ? nextValue : currentHeight;
        return {
          ...overlay,
          [dimension]: nextValue,
          aspectRatio: nextWidth / Math.max(nextHeight, 1),
        };
      })
    );
  };

  const toggleOverlayAspectRatioLock = id => {
    setOverlays(prev =>
      prev.map(overlay => {
        if (overlay.id !== id) return overlay;
        return {
          ...overlay,
          aspectRatioLocked: !overlay.aspectRatioLocked,
          aspectRatio: getOverlayAspectRatio(overlay),
        };
      })
    );
  };

  const moveOverlay = (id, direction) => {
    setOverlays(prev => {
      const currentIndex = prev.findIndex(overlay => overlay.id === id);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [overlay] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, overlay);
      return reordered;
    });
  };

  const moveOverlayToIndex = (id, nextIndex) => {
    setOverlays(prev => {
      const currentIndex = prev.findIndex(overlay => overlay.id === id);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (currentIndex === boundedIndex) return prev;

      const reordered = [...prev];
      const [overlay] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, overlay);
      return reordered;
    });
  };

  const moveTimelineClip = (clipId, direction) => {
    setTimeline(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, clip);

      setActiveTimelineIndex(prevActiveIndex => {
        const activeClipId = prev[prevActiveIndex]?.id;
        const resolvedIndex = reordered.findIndex(item => item.id === activeClipId);
        return resolvedIndex >= 0 ? resolvedIndex : 0;
      });

      return reordered;
    });
  };

  const moveTimelineClipToIndex = (clipId, nextIndex) => {
    setTimeline(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (boundedIndex === currentIndex) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, clip);

      setActiveTimelineIndex(prevActiveIndex => {
        const activeClipId = prev[prevActiveIndex]?.id;
        const resolvedIndex = reordered.findIndex(item => item.id === activeClipId);
        return resolvedIndex >= 0 ? resolvedIndex : 0;
      });

      return reordered;
    });
  };

  const reorderDetectedClips = updater => {
    setOrderedClips(prev => {
      const nextClips = updater(prev);
      setSelectedClip(prevSelected => {
        const selectedId = prevSelected?.id;
        if (!selectedId) return nextClips[0] || null;
        return nextClips.find(clip => clip.id === selectedId) || nextClips[0] || null;
      });
      return nextClips;
    });
  };

  const moveDetectedClip = (clipId, direction) => {
    reorderDetectedClips(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, clip);
      return reordered;
    });
  };

  const moveDetectedClipToIndex = (clipId, nextIndex) => {
    reorderDetectedClips(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (currentIndex === boundedIndex) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, clip);
      return reordered;
    });
  };

  const safePlayMediaElement = mediaElement => {
    if (!mediaElement || typeof mediaElement.play !== "function") return;

    try {
      const playResult = mediaElement.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(error => console.log("Auto-play prevented", error));
      }
    } catch (error) {
      console.log("Auto-play prevented", error);
    }
  };

  const updateOverlayPosition = (id, axis, delta) => {
    setOverlays(prev =>
      prev.map(overlay =>
        overlay.id === id
          ? { ...overlay, [axis]: clampOverlayCoordinate(Number(overlay[axis] ?? 50) + delta) }
          : overlay
      )
    );
  };

  const centerOverlay = id => {
    setOverlays(prev =>
      prev.map(overlay => (overlay.id === id ? { ...overlay, x: 50, y: 50 } : overlay))
    );
  };

  const duplicateOverlay = id => {
    setOverlays(prev => {
      const overlay = prev.find(item => item.id === id);
      if (!overlay) return prev;

      const duplicate = {
        ...overlay,
        id: Date.now() + Math.floor(Math.random() * 1000),
        x: clampOverlayCoordinate(Number(overlay.x ?? 50) + 4),
        y: clampOverlayCoordinate(Number(overlay.y ?? 50) + 4),
      };

      setActiveOverlayId(duplicate.id);
      return [...prev, duplicate];
    });
  };

  const activeOverlay = overlays.find(overlay => overlay.id === activeOverlayId) || null;

  const getTimelineClipWindow = clip => {
    if (!clip) return { start: 0, end: 0, duration: 0 };
    const isPrimaryClip = clip.id === "main" && selectedClip;
    const start =
      clip.startRequest !== null && clip.startRequest !== undefined
        ? clip.startRequest
        : isPrimaryClip
          ? selectedClip.start
          : 0;
    const end =
      clip.endRequest !== null && clip.endRequest !== undefined
        ? clip.endRequest
        : isPrimaryClip
          ? selectedClip.end
          : clip.duration || 0;
    return {
      start,
      end,
      duration: Math.max(0, end - start),
    };
  };

  const getPreviewTimelineTime = sourceTime => {
    let elapsed = 0;
    for (let index = 0; index < activeTimelineIndex; index += 1) {
      elapsed += Math.max(0, Number(getTimelineClipWindow(timeline[index]).duration || 0));
    }

    const currentClip = timeline[activeTimelineIndex];
    const currentWindow = getTimelineClipWindow(currentClip);
    const localStart = Number(currentWindow.start || 0);
    const localDuration = Math.max(0, Number(currentWindow.duration || 0));
    const localTime = Math.max(0, Number(sourceTime || 0) - localStart);

    return elapsed + Math.min(localTime, localDuration || localTime);
  };

  const normalizeBackgroundAudioForExport = audioTrack => {
    if (!audioTrack?.url || audioTrack.enabled === false) return null;

    return {
      url: audioTrack.url,
      trim_start: clampAudioControl(audioTrack.trimStart, 0, audioTrack.duration || 36000, 0),
      volume: clampAudioControl(audioTrack.volume, 0, 1.5, 0.7),
      enabled: true,
    };
  };

  const handleAudioSourceUpload = async event => {
    const sourceFile = event.target.files && event.target.files[0];
    if (!sourceFile) return;

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first");
      event.target.value = "";
      return;
    }

    setIsExtractingAudio(true);
    setAudioExtractionStatus("Uploading source video...");
    if (onStatusChange) onStatusChange("Uploading source video for audio extraction...");

    try {
      let token = await user.getIdToken();
      const uploadResult = await uploadSourceFileViaBackend({
        file: sourceFile,
        token,
        mediaType: "video",
        fileName: sourceFile.name,
      });

      setAudioExtractionStatus("Queueing extraction...");
      if (onStatusChange) onStatusChange("Queueing background-audio extraction...");

      let response = await fetch(API_ENDPOINTS.MEDIA_EXTRACT_AUDIO, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: uploadResult.url,
          sourceLabel: sourceFile.name,
        }),
      });

      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await fetch(API_ENDPOINTS.MEDIA_EXTRACT_AUDIO, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl: uploadResult.url,
            sourceLabel: sourceFile.name,
          }),
        });
      }

      const startPayload = await response.json().catch(() => null);
      if (!response.ok || !startPayload?.jobId) {
        throw new Error(
          startPayload?.details || startPayload?.message || "Failed to start audio extraction"
        );
      }

      const jobId = startPayload.jobId;
      let attempts = 0;
      while (attempts < 180) {
        attempts += 1;
        await sleep(2000);

        let statusResponse = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (statusResponse.status === 401) {
          token = await user.getIdToken(true);
          statusResponse = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (!statusResponse.ok) continue;
        const statusPayload = await statusResponse.json();

        if (statusPayload.status === "failed") {
          throw new Error(statusPayload.error || "Audio extraction failed on the server");
        }

        if (statusPayload.status === "completed") {
          const result = statusPayload.result || {};
          const audioUrl = result.audioUrl || statusPayload.audio_url;
          if (!audioUrl) {
            throw new Error("Audio extraction completed but no audio URL was returned");
          }

          const audioDuration = clampAudioControl(result.audioDuration, 0, 36000, 0);
          setExtractedAudio({
            id: jobId,
            url: audioUrl,
            sourceVideoUrl: uploadResult.url,
            sourceVideoName: sourceFile.name,
            trimStart: 0,
            volume: 0.7,
            enabled: true,
            duration: audioDuration,
            format: result.format || "mp3",
          });
          setAudioExtractionStatus("Background audio added to the timeline.");
          if (onStatusChange)
            onStatusChange("Background audio extracted and added to the timeline.");
          return;
        }

        const progress = clampAudioControl(statusPayload.progress, 0, 100, 0);
        setAudioExtractionStatus(`Extracting audio... ${Math.round(progress)}%`);
        if (onStatusChange)
          onStatusChange(`Extracting background audio... ${Math.round(progress)}%`);
      }

      throw new Error("Audio extraction timed out");
    } catch (error) {
      console.error("Audio extraction failed", error);
      setAudioExtractionStatus(error.message || "Audio extraction failed");
      if (onStatusChange)
        onStatusChange(`Audio extraction failed: ${error.message || "Unknown error"}`);
      alert(`Audio extraction failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsExtractingAudio(false);
      event.target.value = "";
    }
  };

  const buildExportTimeline = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please login first");

    return Promise.all(
      timeline.map(async clip => {
        let clipUrl = clip.url;
        if (clip.file && clip.isLocal) {
          const extension = clip.file.name ? clip.file.name.split(".").pop() : "mp4";
          const fileName = `${Date.now()}_${clip.id}.${extension}`;
          const storageRef = ref(storage, `timeline/${user.uid}/${fileName}`);
          await uploadBytes(storageRef, clip.file);
          clipUrl = await getDownloadURL(storageRef);
        }

        const window = getTimelineClipWindow(clip);
        return {
          id: clip.id,
          url: clipUrl,
          start_time: window.start,
          end_time: window.end,
          duration: window.duration,
        };
      })
    );
  };

  const normalizeOverlaysForExport = (exportTimeline, sourceOverlays) => {
    const offsetByClipId = new Map();
    let runningOffset = 0;
    exportTimeline.forEach(segment => {
      offsetByClipId.set(segment.id, {
        offset: runningOffset,
        start: segment.start_time || 0,
        end: segment.end_time || 0,
      });
      runningOffset += Math.max(0, Number(segment.duration || 0));
    });

    return sourceOverlays.map(overlay => {
      const clipMeta = offsetByClipId.get(overlay.clipId || "main") || {
        offset: 0,
        start: 0,
        end: selectedClip ? selectedClip.end : 0,
      };
      const previewStart =
        overlay.startTime !== undefined && overlay.startTime !== null
          ? overlay.startTime
          : overlay.start_time;
      const normalizedStart =
        previewStart !== undefined && previewStart !== null
          ? clipMeta.offset + Math.max(0, Number(previewStart) - Number(clipMeta.start || 0))
          : undefined;

      return {
        ...overlay,
        start_time: normalizedStart,
        duration:
          overlay.duration !== undefined && overlay.duration !== null
            ? Number(overlay.duration)
            : overlay.duration,
      };
    });
  };

  // Dragging State
  const [isDragging, setIsDragging] = useState(false);
  const dragItem = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Handle video element duration load to set clip max duration
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setTimeline(prev =>
        prev.map((item, idx) =>
          idx === activeTimelineIndex
            ? {
                ...item,
                duration: dur,
                endRequest: item.endRequest || dur,
                startRequest: item.startRequest || 0,
              }
            : item
        )
      );
    }
  };

  useEffect(() => {
    setOrderedClips(clips || []);
  }, [clips]);

  useEffect(() => {
    if (orderedClips && orderedClips.length > 0) {
      if (!selectedClip || !orderedClips.some(clip => clip.id === selectedClip.id)) {
        setSelectedClip(orderedClips[0]);
      }
      return;
    }

    if (selectedClip) {
      setSelectedClip(null);
    }
  }, [orderedClips, selectedClip]);

  useEffect(() => {
    const snapshot = cloneSnapshot(getEditorSnapshot());
    const serializedSnapshot = JSON.stringify(snapshot);

    if (lastSnapshotRef.current === null) {
      lastSnapshotRef.current = serializedSnapshot;
      syncHistoryAvailability();
      return;
    }

    // Dragging can emit many overlay updates per second. Record a single history snapshot
    // when the drag completes instead of pushing one entry for every mouse move.
    if (isDragging) {
      return;
    }

    if (serializedSnapshot === lastSnapshotRef.current) {
      syncHistoryAvailability();
      return;
    }

    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      lastSnapshotRef.current = serializedSnapshot;
      syncHistoryAvailability();
      return;
    }

    undoStackRef.current.push(JSON.parse(lastSnapshotRef.current));
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    lastSnapshotRef.current = serializedSnapshot;
    syncHistoryAvailability();
  }, [
    orderedClips,
    selectedClip,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    extractedAudio,
    timeline,
    activeTimelineIndex,
    isDragging,
  ]);

  useEffect(() => {
    const handleHistoryKeyDown = event => {
      const targetTag = event.target?.tagName;
      const isTypingTarget =
        event.target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag);
      if (isTypingTarget) return;

      const isUndo =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) &&
        ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y");

      if (isUndo) {
        event.preventDefault();
        handleUndo();
      } else if (isRedoShortcut) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleHistoryKeyDown);
    return () => window.removeEventListener("keydown", handleHistoryKeyDown);
  }, [
    orderedClips,
    selectedClip,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    extractedAudio,
    timeline,
    activeTimelineIndex,
  ]);

  useEffect(() => {
    if (!activeOverlayId) return undefined;

    const handleKeyDown = event => {
      const targetTag = event.target?.tagName;
      const isTypingTarget =
        event.target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(targetTag);
      if (isTypingTarget) return;

      const step = event.shiftKey ? 5 : 1;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteOverlay(activeOverlayId);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveOverlayId(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "x", -step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "x", step);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "y", -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "y", step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeOverlayId]);

  // Playback Logic: Handle loop of single clip OR sequence of timeline
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setVideoTime(video.currentTime);

      const currentClip = timeline[activeTimelineIndex];
      // Use configured start/end points if available (trimming)
      // Only apply 'selectedClip' boundaries to the FIRST item in the timeline (which is the viral clip)
      const isViralClip = activeTimelineIndex === 0 && selectedClip;

      const endTime = currentClip.endRequest || (isViralClip ? selectedClip.end : video.duration);
      const startTime = currentClip.startRequest || (isViralClip ? selectedClip.start : 0);

      // If we reach the end of this clip's designated playtime
      if (video.currentTime >= endTime) {
        // If there is a NEXT clip in timeline, play it
        if (activeTimelineIndex < timeline.length - 1) {
          const nextIndex = activeTimelineIndex + 1;
          setActiveTimelineIndex(nextIndex);
        } else {
          // Sequence finished: Loop back to START of the sequence (Clip 1 / Main Video)
          setActiveTimelineIndex(0);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [selectedClip, timeline, activeTimelineIndex]);

  // Effect: Switch video Source when activeTimelineIndex changes OR Jump when selecting a viral clip
  useEffect(() => {
    if (videoRef.current && timeline[activeTimelineIndex]) {
      const clip = timeline[activeTimelineIndex];

      // 1. Handle SRC changes
      // Use property .src for comparison as it is always absolute, just like our Firebase URLs
      const currentSrc = videoRef.current.src;
      if (currentSrc !== clip.url && clip.url) {
        videoRef.current.src = clip.url;
        // Reset to start
        videoRef.current.currentTime =
          clip.startRequest || (selectedClip && activeTimelineIndex === 0 ? selectedClip.start : 0);
        safePlayMediaElement(videoRef.current);
      }
      // 2. Handle JUMP within same file (when selecting a Viral Clip)
      else if (selectedClip && activeTimelineIndex === 0) {
        // Only jump if we are far from the start time (prevents fighting with playback)
        const targetStart = selectedClip.start;
        if (Math.abs(videoRef.current.currentTime - targetStart) > 0.5 && !isDragging) {
          videoRef.current.currentTime = targetStart;
          // Ensure playing
          if (videoRef.current.paused) {
            safePlayMediaElement(videoRef.current);
          }
        }
      }
    }
  }, [activeTimelineIndex, timeline, selectedClip, isDragging]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!audio) return;

    if (!extractedAudio?.url) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    const syncBackgroundAudio = () => {
      if (!video || !extractedAudio?.url) return;

      audio.volume = clampAudioControl(extractedAudio.volume, 0, 1, 0.7);
      audio.playbackRate = video.playbackRate || 1;

      if (extractedAudio.enabled === false) {
        audio.pause();
        return;
      }

      const previewTimelineTime = getPreviewTimelineTime(video.currentTime || 0);
      const targetTime = clampAudioControl(
        previewTimelineTime + Number(extractedAudio.trimStart || 0),
        0,
        (extractedAudio.duration || previewTimelineTime + Number(extractedAudio.trimStart || 0)) +
          1,
        0
      );

      if (Number.isFinite(targetTime) && Math.abs((audio.currentTime || 0) - targetTime) > 0.35) {
        try {
          audio.currentTime = targetTime;
        } catch (error) {
          console.log("Audio sync seek skipped", error);
        }
      }

      if (video.paused) {
        audio.pause();
      } else {
        safePlayMediaElement(audio);
      }
    };

    const pauseBackgroundAudio = () => audio.pause();

    if (video) {
      video.addEventListener("play", syncBackgroundAudio);
      video.addEventListener("pause", pauseBackgroundAudio);
      video.addEventListener("seeking", syncBackgroundAudio);
      video.addEventListener("seeked", syncBackgroundAudio);
      video.addEventListener("timeupdate", syncBackgroundAudio);
      video.addEventListener("loadedmetadata", syncBackgroundAudio);
      video.addEventListener("ratechange", syncBackgroundAudio);
    }

    syncBackgroundAudio();

    return () => {
      if (video) {
        video.removeEventListener("play", syncBackgroundAudio);
        video.removeEventListener("pause", pauseBackgroundAudio);
        video.removeEventListener("seeking", syncBackgroundAudio);
        video.removeEventListener("seeked", syncBackgroundAudio);
        video.removeEventListener("timeupdate", syncBackgroundAudio);
        video.removeEventListener("loadedmetadata", syncBackgroundAudio);
        video.removeEventListener("ratechange", syncBackgroundAudio);
      }
      audio.pause();
    };
  }, [extractedAudio, activeTimelineIndex, timeline, selectedClip]);

  const addTextOverlay = () => {
    // START TIME: Use current video playback time
    // If paused, it's exact. If playing, it's roughly "now".
    const currentVideoTime = videoRef.current ? videoRef.current.currentTime : 0;

    // Adjust relative to the CLIP if we are in a multi-clip timeline?
    // For now, let's assume global timeline time or clip-relative.
    // The backend expects relative to the *output video* start (0.0).
    // If we are editing a single clip, 0.0 is the start of that clip.
    // If the user scrubbed to 5.0s, we want the text to appear at 5.0s.

    // However, if we trim the video (start=10, end=20), the backend trims FIRST.
    // So 0.0 in the output is 10.0 in the source.
    // We need to calculate the relative start time.
    let relativeStartTime = currentVideoTime;

    if (selectedClip && activeTimelineIndex === 0) {
      // If we are trimming, the output starts at selectedClip.start.
      // So if user is at 15s and clip starts at 10s, the text should appear at 5s in the output.
      relativeStartTime = Math.max(0, currentVideoTime - (selectedClip.start || 0));
    }

    const newOverlay = {
      id: Date.now(),
      type: "text",
      text: "Double Click to Edit ✏️",
      x: 50,
      y: 50,
      color: "#ffffff",
      bg: "rgba(0,0,0,0.5)",
      scale: 1,
      isRainbow: true,
      startTime: relativeStartTime,
      duration: 3.0, // Default 3 seconds duration
      clipId: timeline[activeTimelineIndex]?.id || "main",
    };
    setOverlays([...overlays, newOverlay]);
    setActiveOverlayId(newOverlay.id);
  };

  const addVideoLayer = event => {
    const file = event.target.files[0];
    if (!file) return;

    // Basic check for video file
    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    const url = URL.createObjectURL(file);

    // Ask user type: Overlay or Append?
    const type = window.confirm(
      "Click OK to OVERLAY heavily used for reactions (Picture-in-Picture).\nClick Cancel to APPEND to the END of the timeline (Sequencing)."
    )
      ? "overlay"
      : "append";

    if (type === "overlay") {
      const newOverlay = {
        id: Date.now(),
        type: "video",
        src: url,
        file: file,
        isLocal: true,
        x: 50,
        y: 50,
        width: 40,
        height: 30,
        aspectRatioLocked: true,
        aspectRatio: 40 / 30,
        clipId: timeline[activeTimelineIndex]?.id || "main",
      };
      setOverlays(prev => [...prev, newOverlay]);
      setActiveOverlayId(newOverlay.id);
    } else {
      // Add to Timeline (Sequencing)
      // Create temp video to get duration
      const tempId = Date.now();
      const tempVideo = document.createElement("video");
      tempVideo.src = sanitizeUrl(url);
      tempVideo.preload = "metadata";

      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration;
        setTimeline(prev =>
          prev.map(item =>
            item.id === tempId ? { ...item, duration: duration, endRequest: duration } : item
          )
        );
      };

      // Add immediately with 0 duration so user sees it right away
      setTimeline(prev => [
        ...prev,
        {
          id: tempId,
          url: url,
          duration: 0,
          file: file,
          name: file.name,
          isLocal: true,
        },
      ]);
    }

    // Reset input so same file can be selected again if needed
    event.target.value = null;
  };

  const addImageLayer = event => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    addOverlayAsset({
      type: "image",
      src: URL.createObjectURL(file),
      file,
      isLocal: true,
      width: 35,
      height: 35,
    });

    event.target.value = null;
  };

  const addExistingImageOverlay = imageAsset => {
    const src = normalizeAssetUrl(imageAsset);
    if (!src) {
      alert("This image could not be added as an overlay.");
      return;
    }

    addOverlayAsset({
      type: "image",
      src,
      isLocal: false,
      width: 35,
      height: 35,
    });
  };

  // --- NEW: Split Screen (Gameplay Mode) ---
  const handleSplitScreen = (type = "runner") => {
    // 1. Pick a gameplay video based on selection
    let loopUrl = "";
    if (type === "custom") {
      // Handled by file input
      document.getElementById("gameplay-upload-input").click();
      return;
    } else if (GAMEPLAY_OPTIONS[type]) {
      loopUrl = GAMEPLAY_OPTIONS[type].url;
    } else {
      // Fallback
      loopUrl = GAMEPLAY_OPTIONS.runner.url;
    }

    // 2. Add as overlay, but styled specially
    // We want it to take up the BOTTOM HALF (50% height, 100% width, y=50%)
    const newOverlay = {
      id: Date.now(),
      type: "video",
      src: loopUrl,
      isLocal: false,
      x: 50, // Center X
      y: 75, // Center of bottom half (50 + 25)
      width: 100, // Full width
      height: 50, // Half height
      aspectRatioLocked: true,
      aspectRatio: 100 / 50,
      scale: 1,
      // Metadata for UI
      tag: "gameplay",
    };

    setOverlays(prev => [...prev.filter(o => o.tag !== "gameplay"), newOverlay]); // Replace existing gameplay if any
    alert(`🎮 ${GAMEPLAY_OPTIONS[type]?.label || "Gameplay"} Layer Added!`);
  };

  const handleCustomGameplayUpload = event => {
    const file = event.target.files[0];
    if (!file) return;

    const newOverlay = {
      id: Date.now(),
      type: "video",
      src: URL.createObjectURL(file), // Local preview
      file: file, // For upload later
      isLocal: true,
      x: 50,
      y: 75,
      width: 100,
      height: 50,
      aspectRatioLocked: true,
      aspectRatio: 100 / 50,
      tag: "gameplay",
    };

    setOverlays(prev => [...prev.filter(o => o.tag !== "gameplay"), newOverlay]);
    alert("🎮 Custom Gameplay Added!");
  };

  const updateOverlayText = (id, newText) => {
    const safeText = normalizePlainText(newText);
    setOverlays(overlays.map(o => (o.id === id ? { ...o, text: safeText } : o)));
  };

  const deleteOverlay = id => {
    setOverlays(overlays.filter(o => o.id !== id));
  };

  // --- Dragging Logic ---
  const handleMouseMove = e => {
    if (!isDragging || !dragItem.current) return;

    // Support both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // We must track mouse relative to the PHONE FRAME, not the window or element
    const container = e.currentTarget.getBoundingClientRect();

    // Calculate mouse position relative to container
    const relativeX = clientX - container.left;
    const relativeY = clientY - container.top;

    // Convert to percentage (0-100)
    let percentX = (relativeX / container.width) * 100;
    let percentY = (relativeY / container.height) * 100;

    // Clamp to boundaries (0-100)
    percentX = Math.max(0, Math.min(100, percentX));
    percentY = Math.max(0, Math.min(100, percentY));

    setOverlays(prev => {
      const currentOverlay = prev.find(o => o.id === dragItem.current);
      if (!currentOverlay) return prev;

      const currentX = Number(currentOverlay.x ?? 50);
      const currentY = Number(currentOverlay.y ?? 50);
      if (Math.abs(currentX - percentX) < 0.1 && Math.abs(currentY - percentY) < 0.1) {
        return prev;
      }

      return prev.map(o => (o.id === dragItem.current ? { ...o, x: percentX, y: percentY } : o));
    });
  };

  const handleDragStart = (e, overlay) => {
    e.stopPropagation(); // Prevent video click
    e.preventDefault(); // Prevent browser native drag
    setActiveOverlayId(overlay.id);
    setIsDragging(true);
    dragItem.current = overlay.id;
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragItem.current = null;
  };

  return (
    <div className="viral-studio-overlay">
      <div className="viral-studio-container">
        {/* Header */}
        <div className="studio-header">
          <h3>✨ Viral Clip Studio</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="tool-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              data-testid="studio-undo-button"
              title="Undo (Ctrl/Cmd+Z)"
              style={{ opacity: canUndo ? 1 : 0.5 }}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              data-testid="studio-redo-button"
              title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              style={{ opacity: canRedo ? 1 : 0.5 }}
            >
              ↷ Redo
            </button>
            <button className="close-btn" onClick={onCancel}>
              &times;
            </button>
          </div>
        </div>

        <div className="studio-layout">
          {/* Main Preview Area (Phone Aspect Ratio) */}
          <div className="phone-preview-container">
            <div
              className="phone-frame"
              onMouseMove={handleMouseMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleDragEnd}
            >
              <video
                ref={videoRef}
                className="studio-video"
                autoPlay
                playsInline
                controls
                style={{
                  objectFit: videoFit,
                  width: "100%",
                  height: "100%",
                  background: "transparent",
                  position: "relative",
                  zIndex: 10,
                }}
                onClick={() => setActiveOverlayId(null)} // Deselect on video click
              />
              <audio
                ref={audioRef}
                preload="auto"
                src={extractedAudio?.url ? sanitizeUrl(extractedAudio.url) : undefined}
                style={{ display: "none" }}
              />

              {/* Background Layer (Static Gradient instead of Video for Performance) */}
              <div
                className="video-bg-layer"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 0,
                  overflow: "hidden",
                  background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
                }}
              />

              {/* Overlays Layer */}
              <div className="overlays-layer">
                {overlays
                  .filter(o => {
                    // Filter: Only show if it belongs to current clip (or is global/null)
                    // AND if it has timing constraints, check videoTime
                    const currentClipId = timeline[activeTimelineIndex]?.id;
                    const belongsToClip = !o.clipId || o.clipId === currentClipId;

                    if (!belongsToClip) return false;

                    // If it has specific start/duration (like captions), check time
                    const overlayStart =
                      o.startTime !== undefined && o.startTime !== null
                        ? o.startTime
                        : o.start_time;
                    if (overlayStart !== undefined && o.duration !== undefined) {
                      return videoTime >= overlayStart && videoTime <= overlayStart + o.duration;
                    }
                    return true;
                  })
                  .map((overlay, index) => (
                    <div
                      key={overlay.id}
                      className={`draggable-overlay ${activeOverlayId === overlay.id ? "active" : ""}`}
                      style={{
                        top: `${overlay.y}%`,
                        left: `${overlay.x}%`,
                        width:
                          overlay.type === "video" || overlay.type === "image"
                            ? `${overlay.width || 35}%`
                            : "auto",
                        height:
                          overlay.type === "video" || overlay.type === "image"
                            ? `${overlay.height || 35}%`
                            : "auto",
                        backgroundColor: overlay.type === "text" ? overlay.bg : "transparent",
                        color: overlay.color,
                        zIndex: 100 + index,
                      }}
                      onMouseDown={e => handleDragStart(e, overlay)}
                      onTouchStart={e => handleDragStart(e, overlay)}
                      onDoubleClick={() => {
                        if (overlay.type === "text") {
                          const newText = prompt("Edit Text:", normalizePlainText(overlay.text));
                          if (newText !== null) updateOverlayText(overlay.id, newText);
                        }
                      }}
                    >
                      {overlay.type === "text" ? (
                        overlay.isRainbow ? (
                          <RainbowText text={overlay.text} offset={overlay.rainbowOffset || 0} />
                        ) : (
                          normalizePlainText(overlay.text)
                        )
                      ) : overlay.type === "image" ? (
                        <img
                          src={sanitizeUrl(overlay.src)}
                          alt="Overlay"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            borderRadius: "12px",
                            pointerEvents: "none",
                          }}
                        />
                      ) : (
                        <video
                          src={sanitizeUrl(overlay.src)}
                          autoPlay
                          loop
                          muted
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            borderRadius: "12px",
                            pointerEvents: "none",
                          }}
                        />
                      )}

                      {/* Size and Delete Controls for Overlays */}
                      {activeOverlayId === overlay.id && (
                        <>
                          <div className="overlay-controls">
                            <button
                              className="overlay-delete-btn"
                              onClick={e => {
                                e.stopPropagation();
                                deleteOverlay(overlay.id);
                              }}
                            >
                              &times;
                            </button>
                            {(overlay.type === "video" || overlay.type === "image") && (
                              <div
                                className="resize-handle"
                                onMouseDown={e => {
                                  e.stopPropagation();
                                }}
                              >
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    updateOverlaySize(overlay.id, "width", -5);
                                  }}
                                >
                                  W-
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    updateOverlaySize(overlay.id, "width", 5);
                                  }}
                                >
                                  W+
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    updateOverlaySize(overlay.id, "height", -5);
                                  }}
                                >
                                  H-
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    updateOverlaySize(overlay.id, "height", 5);
                                  }}
                                >
                                  H+
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleOverlayAspectRatioLock(overlay.id);
                                  }}
                                  title={
                                    overlay.aspectRatioLocked
                                      ? "Unlock aspect ratio"
                                      : "Lock aspect ratio"
                                  }
                                >
                                  {overlay.aspectRatioLocked ? "Lock" : "Free"}
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    centerOverlay(overlay.id);
                                  }}
                                  title="Center overlay"
                                >
                                  Center
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    duplicateOverlay(overlay.id);
                                  }}
                                  title="Duplicate overlay"
                                >
                                  Copy
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    moveOverlay(overlay.id, "backward");
                                  }}
                                  title="Move layer backward"
                                >
                                  Down
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    moveOverlay(overlay.id, "forward");
                                  }}
                                  title="Move layer forward"
                                >
                                  Up
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    moveOverlay(overlay.id, "back");
                                  }}
                                  title="Send layer to back"
                                >
                                  Back
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    moveOverlay(overlay.id, "front");
                                  }}
                                  title="Bring layer to front"
                                >
                                  Front
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Timeline for Sequencing */}
            <div className="studio-timeline-container">
              <div className="timeline-info">
                <span>Sequencing ({timeline.length})</span>
                {timeline[activeTimelineIndex] && (
                  <span>Playing: Clip {activeTimelineIndex + 1}</span>
                )}
              </div>
              <div className="timeline-scroll-area">
                {timeline.map((clip, index) => (
                  <div
                    key={clip.id}
                    data-testid={`timeline-clip-${clip.id}`}
                    onClick={() => setActiveTimelineIndex(index)}
                    draggable={timeline.length > 1}
                    onDragStart={() => setDraggedTimelineClipId(clip.id)}
                    onDragEnd={() => setDraggedTimelineClipId(null)}
                    onDragOver={e => {
                      e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedTimelineClipId === null || draggedTimelineClipId === clip.id)
                        return;
                      moveTimelineClipToIndex(draggedTimelineClipId, index);
                      setDraggedTimelineClipId(null);
                    }}
                    className={`timeline-clip-thumb ${activeTimelineIndex === index ? "active" : ""}`}
                    title={clip.name || `Clip ${index + 1}`}
                    style={
                      draggedTimelineClipId === clip.id
                        ? { borderStyle: "dashed", borderColor: "#e52e71" }
                        : undefined
                    }
                  >
                    {/* If clip has a name, show first few chars, otherwise show index */}
                    <span
                      className="clip-thumb-label"
                      style={{ fontSize: clip.name ? "12px" : "16px" }}
                    >
                      {clip.name
                        ? clip.name.length > 8
                          ? clip.name.substring(0, 6) + ".."
                          : clip.name
                        : index + 1}
                    </span>

                    {/* Tiny video preview if possible? Too heavy. Use duration. */}
                    <span className="clip-dur-label">
                      {clip.duration
                        ? Math.round(clip.duration) + "s"
                        : clip.startRequest
                          ? "Trimmed"
                          : "..."}
                    </span>

                    {/* Controls Row */}
                    <div
                      className="clip-mini-controls"
                      style={{ display: "flex", gap: "4px", marginTop: "4px" }}
                    >
                      {timeline.length > 1 && (
                        <>
                          <button
                            className="clip-caption-btn"
                            title="Move clip earlier"
                            data-testid={`timeline-move-left-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveTimelineClip(clip.id, "backward");
                            }}
                            disabled={index === 0}
                            style={{
                              fontSize: "10px",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              border: "1px solid #ccc",
                              background: "#fff",
                              cursor: index === 0 ? "default" : "pointer",
                              opacity: index === 0 ? 0.5 : 1,
                            }}
                          >
                            ←
                          </button>
                          <button
                            className="clip-caption-btn"
                            title="Move clip later"
                            data-testid={`timeline-move-right-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveTimelineClip(clip.id, "forward");
                            }}
                            disabled={index === timeline.length - 1}
                            style={{
                              fontSize: "10px",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              border: "1px solid #ccc",
                              background: "#fff",
                              cursor: index === timeline.length - 1 ? "default" : "pointer",
                              opacity: index === timeline.length - 1 ? 0.5 : 1,
                            }}
                          >
                            →
                          </button>
                        </>
                      )}
                      {/* Auto-Caption Button */}
                      <button
                        className="clip-caption-btn"
                        title="Auto-Generate Captions"
                        onClick={async e => {
                          e.stopPropagation();
                          if (
                            !confirm(
                              `Generate captions for ${clip.name || "this clip"}?\n(This uses AI to detect speech - might take 10-30s)`
                            )
                          )
                            return;

                          // 1. Get file blob
                          if (!clip.file) {
                            alert("Can only caption freshly uploaded files. (No file data found)");
                            return;
                          }

                          // 2. Upload to /api/media/transcribe
                          const formData = new FormData();
                          formData.append("file", clip.file);

                          // Show loading state?
                          e.target.innerText = "⏳ AI Listening...";
                          e.target.disabled = true;

                          try {
                            const auth = getAuth();
                            const user = auth.currentUser;
                            const token = user ? await user.getIdToken() : null;

                            // Use configured API BASE URL
                            const res = await fetch(`${API_BASE_URL}/api/media/transcribe`, {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${token}`,
                              },
                              body: formData,
                            });

                            if (!res.ok) {
                              const err = await res.json();
                              throw new Error(err.error || "Upload failed");
                            }

                            let data = await res.json();

                            // ASYNC POLLING (Transcription)
                            if (data.jobId) {
                              const jobId = data.jobId;
                              e.target.innerText = "⏳ Transcribing...";

                              let attempts = 0;
                              while (true) {
                                if (attempts > 120) throw new Error("Transcription timed out");
                                await new Promise(r => setTimeout(r, 2000));
                                attempts++;

                                const sRes = await fetch(
                                  `${API_BASE_URL}/api/media/status/${jobId}`,
                                  {
                                    headers: { Authorization: `Bearer ${token}` },
                                  }
                                );

                                if (!sRes.ok) continue;
                                const sData = await sRes.json();

                                if (sData.status === "failed")
                                  throw new Error(sData.error || "Transcription failed");
                                if (sData.status === "completed") {
                                  data = sData.result; // Expects { segments: [...] }
                                  break;
                                }
                              }
                            }

                            // data.segments = [{ start: 0.0, end: 2.0, text: "Hello" }]
                            if (!data.segments) throw new Error("No segments returned");

                            const filteredSegments = data.segments.filter(seg => {
                              const t = seg.text.toLowerCase().trim();

                              // 1. Filter out known Whisper hallucinations/descriptions
                              const invalidPhrases = [
                                "music outro",
                                "music intro",
                                "background music",
                                "subtitles by",
                                "captioned by",
                                "transcribed by",
                                "copyright",
                                "all rights reserved",
                                "thank you",
                              ];
                              if (invalidPhrases.some(bad => t.includes(bad))) return false;

                              // 2. Filter purely non-verbal brackets like [Music] or (Silence) or (Music Outro)
                              if (
                                (t.startsWith("[") && t.endsWith("]")) ||
                                (t.startsWith("(") && t.endsWith(")"))
                              )
                                return false;

                              // 3. Filter single junk characters or words
                              if (t === "music" || t === "." || t === "you" || t.length < 2)
                                return false;

                              return true;
                            });

                            if (filteredSegments.length === 0) {
                              alert(
                                "Audio processed but no clear speech detected (music/noise filtered)."
                              );
                              return;
                            }

                            const newCaptions = filteredSegments.map((seg, i) => ({
                              id: Date.now() + i,
                              type: "text",
                              text: seg.text.trim(),
                              x: 50,
                              y: i % 2 === 0 ? 80 : 75, // Slight vertical jitter for dynamic feel
                              color: "#ffffff",
                              bg: "rgba(0,0,0,0.6)",
                              scale: 1,
                              isRainbow: true, // Enable cute mode by default for captions
                              startTime: (clip.startRequest || 0) + seg.start,
                              duration: seg.end - seg.start,
                              isCaption: true,
                              clipId: clip.id,
                              // Each word gets its own color in the rainbow
                              rainbowOffset: i * 3,
                            }));

                            setOverlays(prev => [...prev, ...newCaptions]);
                            alert("✨ Captions generated via AI! (Cute Mode Enabled 🌈)");
                          } catch (err) {
                            alert("Error generating captions: " + err.message);
                          } finally {
                            e.target.innerText = "💬 CC";
                            e.target.disabled = false;
                          }
                        }}
                        style={{
                          fontSize: "10px",
                          padding: "2px 5px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        💬 CC
                      </button>

                      {/* Delete Btn */}
                      {timeline.length > 1 && (
                        <button
                          className="clip-delete-btn-mini"
                          title="Remove Clip"
                          onClick={e => {
                            e.stopPropagation();
                            const newTimeline = timeline.filter((_, i) => i !== index);
                            setTimeline(newTimeline);
                            if (activeTimelineIndex >= index)
                              setActiveTimelineIndex(Math.max(0, activeTimelineIndex - 1));
                          }}
                          style={{
                            fontSize: "10px",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            border: "1px solid #ff4757",
                            color: "#ff4757",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <label className="add-clip-btn" title="Add Video to Timeline">
                  +
                  <input
                    data-testid="timeline-add-clip-input"
                    type="file"
                    accept="video/*"
                    style={{ display: "none" }}
                    onChange={addVideoLayer}
                  />
                </label>
              </div>
            </div>

            {/* Trimming Controls for Active Clip - SIMPLIFIED FOR DEBUG */}
            {timeline[activeTimelineIndex] && (
              <div className="studio-trim-controls">
                <div className="trim-header">✂️ Trim Clip {activeTimelineIndex + 1}</div>
                <div>
                  <label>
                    Start:{" "}
                    <input
                      type="range"
                      min={0}
                      max={(timeline[activeTimelineIndex].duration || 10) - 0.5}
                      step={0.1}
                      value={timeline[activeTimelineIndex].startRequest || 0}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setTimeline(prev =>
                          prev.map((item, i) =>
                            i === activeTimelineIndex ? { ...item, startRequest: val } : item
                          )
                        );
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }}
                    />
                  </label>
                  <label>
                    End:{" "}
                    <input
                      type="range"
                      min={(timeline[activeTimelineIndex].startRequest || 0) + 0.5}
                      max={timeline[activeTimelineIndex].duration || 100}
                      step={0.1}
                      value={
                        timeline[activeTimelineIndex].endRequest ||
                        timeline[activeTimelineIndex].duration ||
                        10
                      }
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setTimeline(prev =>
                          prev.map((item, i) =>
                            i === activeTimelineIndex ? { ...item, endRequest: val } : item
                          )
                        );
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="studio-trim-controls">
              <div className="trim-header">🎧 Background Audio</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => audioSourceInputRef.current?.click()}
                  disabled={isExtractingAudio}
                >
                  <span>🎵</span> {isExtractingAudio ? "Extracting..." : "Upload Video For Sound"}
                </button>
                {extractedAudio ? (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() =>
                      setExtractedAudio(prev => (prev ? { ...prev, enabled: !prev.enabled } : prev))
                    }
                  >
                    <span>{extractedAudio.enabled === false ? "▶️" : "⏸️"}</span>{" "}
                    {extractedAudio.enabled === false ? "Play Track" : "Pause Track"}
                  </button>
                ) : null}
                {extractedAudio ? (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => setExtractedAudio(null)}
                  >
                    <span>🗑️</span> Remove Track
                  </button>
                ) : null}
                <input
                  data-testid="background-audio-upload-input"
                  ref={audioSourceInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={handleAudioSourceUpload}
                />
              </div>

              {audioExtractionStatus ? (
                <div
                  style={{
                    marginBottom: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  {audioExtractionStatus}
                </div>
              ) : null}

              {extractedAudio ? (
                <div
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #fff4d6 0%, #ffe4bf 100%)",
                    border: "1px solid rgba(17, 24, 39, 0.1)",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827", marginBottom: "6px" }}>
                    {extractedAudio.sourceVideoName || "Extracted audio"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#374151", marginBottom: "8px" }}>
                    Added as a single background-audio lane for preview and final export.
                  </div>
                  <div
                    style={{
                      height: "10px",
                      borderRadius: "999px",
                      background: "rgba(17, 24, 39, 0.12)",
                      overflow: "hidden",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background:
                          extractedAudio.enabled === false
                            ? "linear-gradient(90deg, #9ca3af 0%, #6b7280 100%)"
                            : "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)",
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    Trim Start:{" "}
                    {clampAudioControl(
                      extractedAudio.trimStart,
                      0,
                      extractedAudio.duration || 36000,
                      0
                    ).toFixed(1)}
                    s
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, extractedAudio.duration || 0)}
                      step={0.1}
                      value={clampAudioControl(
                        extractedAudio.trimStart,
                        0,
                        extractedAudio.duration || 36000,
                        0
                      )}
                      onChange={e =>
                        setExtractedAudio(prev =>
                          prev
                            ? {
                                ...prev,
                                trimStart: clampAudioControl(
                                  e.target.value,
                                  0,
                                  prev.duration || 36000,
                                  0
                                ),
                              }
                            : prev
                        )
                      }
                      style={{ width: "100%", marginTop: "6px" }}
                    />
                  </label>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#111827",
                      marginTop: "10px",
                    }}
                  >
                    Volume: {Math.round(clampAudioControl(extractedAudio.volume, 0, 1, 0.7) * 100)}%
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={clampAudioControl(extractedAudio.volume, 0, 1, 0.7)}
                      onChange={e =>
                        setExtractedAudio(prev =>
                          prev
                            ? {
                                ...prev,
                                volume: clampAudioControl(e.target.value, 0, 1, 0.7),
                              }
                            : prev
                        )
                      }
                      style={{ width: "100%", marginTop: "6px" }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
          {/* End of phone-preview-container */}

          {/* Controls Sidebar - Sibling of phone-preview-container */}
          <div className="studio-sidebar">
            <div className="clips-list">
              <h4>🔥 Detected Viral Moments</h4>
              <div className="clips-scroller">
                {orderedClips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    data-testid={`detected-clip-${clip.id}`}
                    className={`clip-card ${selectedClip && selectedClip.id === clip.id ? "active" : ""}`}
                    draggable={orderedClips.length > 1}
                    onDragStart={() => setDraggedDetectedClipId(clip.id)}
                    onDragEnd={() => setDraggedDetectedClipId(null)}
                    onDragOver={e => {
                      e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedDetectedClipId === null || draggedDetectedClipId === clip.id)
                        return;
                      moveDetectedClipToIndex(draggedDetectedClipId, idx);
                      setDraggedDetectedClipId(null);
                    }}
                    onClick={() => {
                      setSelectedClip(clip);
                      videoRef.current.src = sanitizeUrl(videoUrl); // Reset to main video source
                    }}
                    style={
                      draggedDetectedClipId === clip.id
                        ? { borderStyle: "dashed", borderColor: "#e52e71" }
                        : undefined
                    }
                  >
                    <span className="clip-badge">#{idx + 1}</span>
                    <span className="clip-time">{Math.round(clip.duration)}s</span>
                    <p>{normalizePlainText(clip.reason)}</p>
                    {orderedClips.length > 1 && (
                      <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                        <button
                          type="button"
                          className="resize-btn"
                          title="Move moment earlier"
                          data-testid={`detected-move-left-${clip.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            moveDetectedClip(clip.id, "backward");
                          }}
                          disabled={idx === 0}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="resize-btn"
                          title="Move moment later"
                          data-testid={`detected-move-right-${clip.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            moveDetectedClip(clip.id, "forward");
                          }}
                          disabled={idx === orderedClips.length - 1}
                        >
                          →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="editing-tools">
              <h4>🎨 Customize</h4>
              <button className="tool-btn" onClick={addTextOverlay}>
                <span>📝</span> Add Text
              </button>
              <button
                className="tool-btn"
                onClick={() => {
                  setOverlays(prev =>
                    prev.map(o => (o.type === "text" ? { ...o, isRainbow: !o.isRainbow } : o))
                  );
                }}
              >
                <span>🌈</span> Toggle Rainbow
              </button>
              <button
                className="tool-btn"
                onClick={() => document.getElementById("video-upload-input").click()}
              >
                <span>📹</span> Add Video
              </button>
              <button className="tool-btn" onClick={() => imageInputRef.current?.click()}>
                <span>🖼️</span> Add Image
              </button>
              <button
                className="tool-btn"
                onClick={() => setVideoFit(prev => (prev === "contain" ? "cover" : "contain"))}
              >
                <span>📐</span> Fit: {videoFit === "contain" ? "FULL" : "ZOOM"}
              </button>
              <input
                id="video-upload-input"
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={addVideoLayer}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={addImageLayer}
              />
              {images.length > 0 && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px",
                    background: "#f5f5f5",
                    borderRadius: "8px",
                  }}
                >
                  <h5 style={{ margin: "0 0 8px 0" }}>🖼️ Image Library</h5>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {images.slice(0, 6).map((imageAsset, index) => {
                      const imageSrc = normalizeAssetUrl(imageAsset);
                      if (!imageSrc) return null;
                      return (
                        <button
                          key={imageAsset.id || imageSrc || index}
                          type="button"
                          onClick={() => addExistingImageOverlay(imageAsset)}
                          style={{
                            width: "58px",
                            height: "58px",
                            padding: 0,
                            borderRadius: "8px",
                            border: "1px solid #d0d0d0",
                            overflow: "hidden",
                            cursor: "pointer",
                            background: "#fff",
                          }}
                          title="Add image overlay"
                        >
                          <img
                            src={sanitizeUrl(imageSrc)}
                            alt="Overlay option"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button
                className="tool-btn"
                onClick={() => {
                  const choice = prompt(
                    "Enter 'pop' for Upbeat Pop, 'lofi' for LoFi Chill, or type a song name to search YouTube:",
                    currentMusic || "pop"
                  );
                  if (choice) {
                    if (choice.toLowerCase() === "pop") {
                      alert("Selected: Upbeat Pop (Preset)");
                      if (onMusicChange) onMusicChange("upbeat_pop.mp3", false);
                    } else if (choice.toLowerCase() === "lofi") {
                      alert("Selected: LoFi Chill (Preset)");
                      if (onMusicChange) onMusicChange("lofi_chill.mp3", false);
                    } else {
                      alert(`Selected: Search for '${choice}' (YouTube)`);
                      if (onMusicChange) onMusicChange(choice, true);
                    }
                  }
                }}
              >
                <span>🎵</span> Change Music ({currentMusic || "None"})
              </button>

              <div
                style={{
                  marginTop: "15px",
                  padding: "10px",
                  background: "#f5f5f5",
                  borderRadius: "8px",
                }}
              >
                <h5 style={sidebarSectionTitleStyle}>🤖 AI Enhancements</h5>
                <label style={{ ...sidebarCheckboxLabelStyle, marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked={autoCaptions}
                    onChange={e => setAutoCaptions(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Auto-Captions (Burn-in)
                </label>
                <label style={sidebarCheckboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={smartCrop}
                    onChange={e => setSmartCrop(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Smart Crop (Keep face centered)
                </label>
              </div>

              {overlays.length > 0 && (
                <div
                  style={{
                    marginTop: "15px",
                    padding: "10px",
                    background: "#f5f5f5",
                    borderRadius: "8px",
                  }}
                >
                  <h5 style={{ margin: "0 0 10px 0" }}>🧱 Overlay Layers</h5>
                  <p style={{ fontSize: "12px", color: "#666", margin: "0 0 8px 0" }}>
                    Top layer is listed first. Reordering here affects preview and final render.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[...overlays].reverse().map((overlay, reversedIndex) => {
                      const actualIndex = overlays.length - 1 - reversedIndex;
                      const isActive = activeOverlayId === overlay.id;
                      const label =
                        overlay.type === "text"
                          ? `Text: ${(overlay.text || "").slice(0, 16) || "Untitled"}`
                          : overlay.tag === "gameplay"
                            ? "Gameplay Layer"
                            : `${overlay.type === "image" ? "Image" : "Video"} Overlay`;

                      return (
                        <div
                          key={overlay.id}
                          onClick={() => setActiveOverlayId(overlay.id)}
                          draggable
                          onDragStart={() => setDraggedOverlayId(overlay.id)}
                          onDragEnd={() => setDraggedOverlayId(null)}
                          onDragOver={e => {
                            e.preventDefault();
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            if (draggedOverlayId === null || draggedOverlayId === overlay.id)
                              return;
                            moveOverlayToIndex(draggedOverlayId, actualIndex);
                            setDraggedOverlayId(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px",
                            borderRadius: "8px",
                            border:
                              draggedOverlayId === overlay.id
                                ? "2px dashed #e52e71"
                                : isActive
                                  ? "2px solid #111"
                                  : "1px solid #ddd",
                            background: isActive ? "#fff" : "#fafafa",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ flex: 1, fontSize: "12px", fontWeight: 600 }}>
                            {label}
                          </span>
                          {(overlay.type === "video" || overlay.type === "image") && (
                            <button
                              type="button"
                              className="resize-btn"
                              onClick={e => {
                                e.stopPropagation();
                                toggleOverlayAspectRatioLock(overlay.id);
                              }}
                              title={
                                overlay.aspectRatioLocked
                                  ? "Unlock aspect ratio"
                                  : "Lock aspect ratio"
                              }
                            >
                              {overlay.aspectRatioLocked ? "Lock" : "Free"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="resize-btn"
                            onClick={e => {
                              e.stopPropagation();
                              moveOverlay(overlay.id, "forward");
                            }}
                            disabled={actualIndex === overlays.length - 1}
                            title="Move toward the front"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="resize-btn"
                            onClick={e => {
                              e.stopPropagation();
                              moveOverlay(overlay.id, "backward");
                            }}
                            disabled={actualIndex === 0}
                            title="Move toward the back"
                          >
                            ↓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeOverlay && (
                <div
                  style={{
                    marginTop: "15px",
                    padding: "10px",
                    background: "#f5f5f5",
                    borderRadius: "8px",
                  }}
                >
                  <h5 style={{ margin: "0 0 10px 0" }}>🎛️ Active Overlay</h5>
                  <p style={{ fontSize: "12px", color: "#666", margin: "0 0 10px 0" }}>
                    Arrow keys nudge the selected overlay. Hold Shift for larger steps.
                  </p>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600 }}>
                      X Position: {Math.round(activeOverlay.x || 0)}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeOverlay.x || 0}
                        onChange={e =>
                          updateOverlayPosition(
                            activeOverlay.id,
                            "x",
                            Number(e.target.value) - Number(activeOverlay.x || 0)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </label>
                    <label style={{ fontSize: "12px", fontWeight: 600 }}>
                      Y Position: {Math.round(activeOverlay.y || 0)}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeOverlay.y || 0}
                        onChange={e =>
                          updateOverlayPosition(
                            activeOverlay.id,
                            "y",
                            Number(e.target.value) - Number(activeOverlay.y || 0)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </label>
                    {(activeOverlay.type === "video" || activeOverlay.type === "image") && (
                      <>
                        <label style={{ fontSize: "12px", fontWeight: 600 }}>
                          Width: {Math.round(activeOverlay.width || 0)}%
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={1}
                            value={activeOverlay.width || 35}
                            onChange={e =>
                              updateOverlaySize(
                                activeOverlay.id,
                                "width",
                                Number(e.target.value) - Number(activeOverlay.width || 35)
                              )
                            }
                            style={{ width: "100%" }}
                          />
                        </label>
                        <label style={{ fontSize: "12px", fontWeight: 600 }}>
                          Height: {Math.round(activeOverlay.height || 0)}%
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={1}
                            value={activeOverlay.height || 35}
                            onChange={e =>
                              updateOverlaySize(
                                activeOverlay.id,
                                "height",
                                Number(e.target.value) - Number(activeOverlay.height || 35)
                              )
                            }
                            style={{ width: "100%" }}
                          />
                        </label>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={() => toggleOverlayAspectRatioLock(activeOverlay.id)}
                          >
                            {activeOverlay.aspectRatioLocked ? "Unlock Ratio" : "Lock Ratio"}
                          </button>
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={() => centerOverlay(activeOverlay.id)}
                          >
                            Center Overlay
                          </button>
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={() => duplicateOverlay(activeOverlay.id)}
                          >
                            Duplicate
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: "15px",
                padding: "10px",
                background: "#f5f5f5",
                borderRadius: "8px",
              }}
            >
              <h5 style={sidebarSectionTitleStyle}>🎮 Split-Screen (Retention)</h5>
              <p style={{ ...sidebarBodyTextStyle, margin: "0 0 8px 0" }}>
                Add a gameplay loop to default to keep viewers watching if there's a lull in your
                video.
              </p>
              <div style={{ display: "flex", gap: "5px", flexDirection: "column" }}>
                <button
                  style={sidebarActionButtonStyle}
                  onClick={() => handleSplitScreen("runner")}
                >
                  🏎️ Add Runner
                </button>
                <button
                  style={sidebarActionButtonStyle}
                  onClick={() => handleSplitScreen("shooter")}
                >
                  🔫 Add Shooter
                </button>
                <button
                  style={sidebarActionButtonStyle}
                  onClick={() => document.getElementById("gameplay-upload-input").click()}
                >
                  📁 Upload Custom
                </button>
                <input
                  id="gameplay-upload-input"
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={handleCustomGameplayUpload}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: "15px",
                padding: "10px",
                background: "#f5f5f5",
                borderRadius: "8px",
              }}
            >
              <h5 style={sidebarSectionTitleStyle}>🤖 AI Enhancements</h5>

              <button
                className="export-btn"
                onClick={async e => {
                  const btn = e.target;
                  btn.innerText = "Rendering Captions...";
                  btn.disabled = true;

                  // Pre-upload logic for local files
                  const auth = getAuth();
                  if (!auth.currentUser) return alert("Please login first");

                  try {
                    const exportTimeline = await buildExportTimeline();
                    const newOverlays = await Promise.all(
                      overlays.map(async overlay => {
                        let fileToUpload = overlay.file;
                        let isNewBlob = false;
                        let finalOverlay = { ...overlay };

                        // If it's a styled text caption, convert to image FIRST
                        if (overlay.type === "text" && overlay.isRainbow) {
                          // Render offscreen canvas
                          const tempContainer = document.createElement("div");
                          tempContainer.style.position = "absolute";
                          tempContainer.style.left = "-9999px";
                          tempContainer.style.background = "transparent";
                          tempContainer.style.padding = "20px";
                          // Match exact styles
                          tempContainer.style.fontFamily =
                            '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif';
                          tempContainer.style.fontSize = "32px";
                          tempContainer.style.fontWeight = "900";
                          tempContainer.style.textShadow = "3px 3px 0 #000";
                          tempContainer.style.webkitTextStroke = "1.5px black";
                          tempContainer.style.whiteSpace = "pre-wrap";

                          const chars = (overlay.text || "").split("");
                          chars.forEach((char, idx) => {
                            const span = document.createElement("span");
                            span.textContent = char;
                            const offset = overlay.rainbowOffset || 0;
                            span.style.color =
                              RAINBOW_COLORS[(idx + offset) % RAINBOW_COLORS.length];
                            tempContainer.appendChild(span);
                          });

                          document.body.appendChild(tempContainer);

                          try {
                            // Wait for rendering
                            const canvas = await html2canvas(tempContainer, {
                              backgroundColor: null,
                              scale: 2,
                            });
                            const blob = await new Promise(resolve =>
                              canvas.toBlob(resolve, "image/png")
                            );
                            fileToUpload = blob;
                            isNewBlob = true;
                            // Change overlay type to image for backend processing
                            finalOverlay.type = "image";
                            finalOverlay.text = undefined;
                          } catch (e) {
                            console.error("Failed to render caption:", e);
                          } finally {
                            document.body.removeChild(tempContainer);
                          }
                        }

                        // If we have a file to upload (either new blob or existing video file)
                        if (fileToUpload && (isNewBlob || overlay.isLocal)) {
                          const ext = isNewBlob
                            ? "png"
                            : fileToUpload.name
                              ? fileToUpload.name.split(".").pop()
                              : "bin";
                          const fileName = `${Date.now()}_${overlay.id}.${ext}`;
                          const storageRef = ref(
                            storage,
                            `overlays/${auth.currentUser.uid}/${fileName}`
                          );
                          await uploadBytes(storageRef, fileToUpload);
                          const url = await getDownloadURL(storageRef);

                          finalOverlay.src = url;
                          finalOverlay.isLocal = false;
                          finalOverlay.file = null;
                        }

                        return finalOverlay;
                      })
                    );

                    const normalizedOverlays = normalizeOverlaysForExport(
                      exportTimeline,
                      newOverlays
                    );

                    setOverlays(newOverlays);
                    // Pass AI options to the save handler
                    onSave(selectedClip, normalizedOverlays, {
                      autoCaptions,
                      smartCrop,
                      timelineSegments: exportTimeline,
                      backgroundAudio: normalizeBackgroundAudioForExport(extractedAudio),
                    });
                  } catch (err) {
                    alert("Export failed: " + err.message);
                  } finally {
                    btn.innerText = "Export & Render 🚀 (Beta)";
                    btn.disabled = false;
                  }
                }}
              >
                Export & Render 🚀 (Beta)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViralClipStudio;
