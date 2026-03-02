import { API_BASE_URL } from "../config";
import React, { useState, useRef, useEffect } from "react";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import html2canvas from "html2canvas"; // For rendering styled captions
import "./ViralClipStudio.css"; // We'll create this CSS next

// --- Constants for Cute/Rainbow Styles ---
const GAMEPLAY_LOOPS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", // Placeholder: Replace with Minecraft Parkour
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", // Placeholder: Replace with Slime Cutting
];

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

const RainbowText = ({ text, offset = 0 }) => {
  if (!text) return null;
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
      {text.split("").map((char, index) => (
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

const ViralClipStudio = ({
  videoUrl,
  clips,
  onSave,
  onCancel,
  onStatusChange,
  currentMusic,
  onMusicChange,
}) => {
  const [selectedClip, setSelectedClip] = useState(clips[0]);
  const [overlays, setOverlays] = useState([]);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoFit, setVideoFit] = useState("contain"); // 'contain', 'cover' (fill), 'fill' (stretch)

  const [timeline, setTimeline] = useState(() => {
    // Initial timeline is just the main video URL, effectively one clip
    return [{ id: "main", url: videoUrl, duration: 0, startRequest: null, endRequest: null }];
  });
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null); // Hidden file input

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
        videoRef.current.play().catch(e => console.log("Auto-play prevented", e));
      }
      // 2. Handle JUMP within same file (when selecting a Viral Clip)
      else if (selectedClip && activeTimelineIndex === 0) {
        // Only jump if we are far from the start time (prevents fighting with playback)
        const targetStart = selectedClip.start;
        if (Math.abs(videoRef.current.currentTime - targetStart) > 0.5 && !isDragging) {
          videoRef.current.currentTime = targetStart;
          // Ensure playing
          if (videoRef.current.paused) {
            videoRef.current.play().catch(e => console.log("Auto-play prevented", e));
          }
        }
      }
    }
  }, [activeTimelineIndex, timeline, selectedClip, isDragging]);

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
      start_time: relativeStartTime,
      duration: 3.0, // Default 3 seconds duration
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
      };
      setOverlays(prev => [...prev, newOverlay]);
      setActiveOverlayId(newOverlay.id);
    } else {
      // Add to Timeline (Sequencing)
      // Create temp video to get duration
      const tempId = Date.now();
      const tempVideo = document.createElement("video");
      tempVideo.src = url;
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

  // --- NEW: Split Screen (Gameplay Mode) ---
  const handleSplitScreen = () => {
    // 1. Pick a random gameplay video
    const randomLoop = GAMEPLAY_LOOPS[Math.floor(Math.random() * GAMEPLAY_LOOPS.length)];

    // 2. Add as overlay, but styled specially
    // We want it to take up the BOTTOM HALF (50% height, 100% width, y=50%)
    // And we want the main video to take up TOP HALF.

    // Update the main video frame? No, we can't easily resize the base <video>.
    // Trick: Add TWO overlays. One is Main Video (scaled), One is Gameplay (scaled).
    // Or: Cover bottom half with overlay.

    const newOverlay = {
      id: Date.now(),
      type: "video",
      src: randomLoop,
      isLocal: false,
      x: 50, // Center X
      y: 75, // Center of bottom half (50 + 25)
      width: 100, // Full width
      height: 50, // Half height? (approx)
      scale: 1,
    };

    // To make it look "Split Screen", the main video might still be full height behind it.
    // This is MVP. A pro version would resize the base video.
    // For now, let's just add the gameplay overlay at the bottom.

    setOverlays(prev => [...prev, newOverlay]);
    alert("🎮 Gameplay Layer Added! Drag to position or resize.");
  };

  const updateOverlayText = (id, newText) => {
    setOverlays(overlays.map(o => (o.id === id ? { ...o, text: newText } : o)));
  };

  const deleteOverlay = id => {
    setOverlays(overlays.filter(o => o.id !== id));
  };

  // --- Dragging Logic ---
  const handleMouseMove = e => {
    if (!isDragging || !dragItem.current) return;

    // We must track mouse relative to the PHONE FRAME, not the window or element
    const container = e.currentTarget.getBoundingClientRect();

    // Calculate mouse position relative to container
    const relativeX = e.clientX - container.left;
    const relativeY = e.clientY - container.top;

    // Convert to percentage (0-100)
    let percentX = (relativeX / container.width) * 100;
    let percentY = (relativeY / container.height) * 100;

    // Clamp to boundaries (0-100)
    percentX = Math.max(0, Math.min(100, percentX));
    percentY = Math.max(0, Math.min(100, percentY));

    setOverlays(prev =>
      prev.map(o => (o.id === dragItem.current ? { ...o, x: percentX, y: percentY } : o))
    );
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
          <button className="close-btn" onClick={onCancel}>
            &times;
          </button>
        </div>

        <div className="studio-layout">
          {/* Main Preview Area (Phone Aspect Ratio) */}
          <div className="phone-preview-container">
            <div
              className="phone-frame"
              onMouseMove={handleMouseMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
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

              {/* Background Video Layer (Clear & Visible) */}
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
                }}
              >
                <video
                  key={timeline[activeTimelineIndex]?.id || "bg-video"}
                  src={timeline[activeTimelineIndex]?.url || videoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scale(1.05)",
                    opacity: 0.8,
                    filter: "blur(10px)",
                  }}
                />
              </div>

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
                    if (o.startTime !== undefined && o.duration !== undefined) {
                      return videoTime >= o.startTime && videoTime <= o.startTime + o.duration;
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
                        width: overlay.type === "video" ? `${overlay.width}%` : "auto",
                        height:
                          overlay.type === "video"
                            ? "auto"
                            : "auto" /* Let aspect ratio decide height */,
                        backgroundColor: overlay.type === "text" ? overlay.bg : "transparent",
                        color: overlay.color,
                        zIndex: 100 + index,
                      }}
                      onMouseDown={e => handleDragStart(e, overlay)}
                      onDoubleClick={() => {
                        if (overlay.type === "text") {
                          const newText = prompt("Edit Text:", overlay.text);
                          if (newText) updateOverlayText(overlay.id, newText);
                        }
                      }}
                    >
                      {overlay.type === "text" ? (
                        overlay.isRainbow ? (
                          <RainbowText text={overlay.text} offset={overlay.rainbowOffset || 0} />
                        ) : (
                          overlay.text
                        )
                      ) : (
                        <video
                          src={overlay.src}
                          autoPlay
                          loop
                          muted
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
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
                            {overlay.type === "video" && (
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
                                    setOverlays(
                                      overlays.map(o =>
                                        o.id === overlay.id
                                          ? { ...o, width: Math.max(10, o.width - 5) }
                                          : o
                                      )
                                    );
                                  }}
                                >
                                  -
                                </button>
                                <button
                                  className="resize-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setOverlays(
                                      overlays.map(o =>
                                        o.id === overlay.id
                                          ? { ...o, width: Math.min(100, o.width + 5) }
                                          : o
                                      )
                                    );
                                  }}
                                >
                                  +
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
                    onClick={() => setActiveTimelineIndex(index)}
                    className={`timeline-clip-thumb ${activeTimelineIndex === index ? "active" : ""}`}
                    title={clip.name || `Clip ${index + 1}`}
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
                              startTime: (clip.startTime || 0) + seg.start,
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
          </div>
          {/* End of phone-preview-container */}

          {/* Controls Sidebar - Sibling of phone-preview-container */}
          <div className="studio-sidebar">
            <div className="clips-list">
              <h4>🔥 Detected Viral Moments</h4>
              <div className="clips-scroller">
                {clips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    className={`clip-card ${selectedClip && selectedClip.id === clip.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedClip(clip);
                      videoRef.current.src = videoUrl; // Reset to main video source
                    }}
                  >
                    <span className="clip-badge">#{idx + 1}</span>
                    <span className="clip-time">{Math.round(clip.duration)}s</span>
                    <p>{clip.reason}</p>
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
            </div>

            <div className="action-buttons">
              <button
                className="gameplay-btn"
                style={{
                  width: "100%",
                  marginBottom: "10px",
                  background: "#333",
                  color: "#fff",
                  padding: "10px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  border: "1px solid #444",
                  fontWeight: "bold",
                }}
                onClick={handleSplitScreen}
              >
                🎮 Add Gameplay (Split Screen)
              </button>

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

                    setOverlays(newOverlays);
                    onSave(selectedClip, newOverlays);
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
