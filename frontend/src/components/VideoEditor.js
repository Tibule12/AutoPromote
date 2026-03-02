/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import "./VideoEditor.css";
// Use the main API URL (Node.js) instead of direct Python worker
import { API_BASE_URL } from "../config";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import ViralClipStudio from "./ViralClipStudio"; // Import the new Studio component

function VideoEditor({ file, onSave, onCancel, images = [] }) {
  const [videoSrc, setVideoSrc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [processedFile, setProcessedFile] = useState(null);
  const [clipSuggestions, setClipSuggestions] = useState(null); // Store detected clips

  // Phase 1 Features State
  const [options, setOptions] = useState({
    smartCrop: false, // 9:16 Vertical Crop (Face Detection)
    cropStyle: "blur", // "blur" (Fit - content safe) or "zoom" (Fill - cuts sides)
    silenceRemoval: false, // Jump Cut / Dead Air Removal
    captions: false, // Auto-Captions (Whisper)
    muteAudio: false, // Strip original audio
    addMusic: false, // Background Music
    analyzeClips: false, // 🔍 NEW: Find Viral Moments
    isSearch: false, // Use YouTube Search for Music
    safeSearch: true, // Default: Search only royalty-free music
    musicFile: "upbeat_pop.mp3", // Default filename or search query
    addHook: false, // 🎣 Viral Hook
    hookText: "WAIT FOR IT...", // Default hook text
  });

  const videoRef = useRef(null);

  // Initialize video source from file prop
  useEffect(() => {
    if (file) {
      if (file.isRemote) {
        setVideoSrc(file.url);
        setProcessedFile(file);
      } else {
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        setProcessedFile(file); // Default to original
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file]);

  const toggleOption = key => {
    // Allow users to stack multiple AI features comfortably
    if (key === "analyzeClips") {
      // "Find Viral Moments" is a special mode that changes the UI flow
      // so we might want to keep it exclusive or handle it carefully.
      // For now, let's keep analyze separate as it returns data, not a video.
      setOptions(prev => ({
        ...prev,
        analyzeClips: !prev.analyzeClips,
        // If turning ON analysis, disable render-heavy opts to avoid confusion
        // (or we can leave them and the backend handles it)
        smartCrop: !prev.analyzeClips ? false : prev.smartCrop,
        silenceRemoval: !prev.analyzeClips ? false : prev.silenceRemoval,
        captions: !prev.analyzeClips ? false : prev.captions,
        addMusic: !prev.analyzeClips ? false : prev.addMusic,
      }));
    } else {
      // For all other enhancements (Crop, Silence, Captions, Music), allow stacking!
      setOptions(prev => ({
        ...prev,
        [key]: !prev[key],
        // content analysis is mutually exclusive with direct rendering usually
        analyzeClips: false,
      }));
    }
  };

  const handleProcess = async () => {
    if (
      !options.smartCrop &&
      !options.silenceRemoval &&
      !options.captions &&
      !options.muteAudio &&
      !options.addMusic &&
      !options.analyzeClips &&
      !options.addHook
    ) {
      setStatusMessage("Please select at least one AI feature.");
      return;
    }

    setProcessing(true);
    setStatusMessage("Initializing AI Processing...");

    try {
      // 1. Get Auth Token
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in to use AI tools.");
      const token = await user.getIdToken();

      // 2. Upload File (if local)
      let fileUrl = "";
      // Track original uploaded path for cleanup
      let tempUploadRef = null;

      // Use the CURRENT processed file (initially clean, then result of previous op)
      const targetFile = processedFile || file;

      if (targetFile instanceof File || targetFile instanceof Blob) {
        setStatusMessage("Uploading video for processing...");
        const storagePath = `temp_uploads/${user.uid}/${Date.now()}_source.mp4`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, targetFile);
        fileUrl = await getDownloadURL(storageRef);
        tempUploadRef = storageRef;
      } else {
        // Assume it's already a URL if passed as string or object with url
        // This handles our "fakeFile" produced by previous steps (with .url property)
        fileUrl = targetFile && targetFile.url ? targetFile.url : targetFile;
      }

      setStatusMessage("Processing Video (This may take a minute)...");

      // 3. Call Node.js Backend
      console.log("Sending AI Request:", { fileUrl, options });

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: fileUrl,
          options: options,
        }),
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 402) {
          // STRICT CREDIT BILLING: AI Features are Pay-As-You-Go
          throw new Error(
            "⚠️ AI Video Processing requires Growth Credits. This is separate from your subscription. Please purchase credits (PayPal/PayFast) in the Marketplace."
          );
        }
        const errorData = await response.json();
        // Include detailed error message from backend if available
        const message = errorData.details
          ? `${errorData.message}: ${errorData.details}`
          : errorData.message || "Processing Failed";
        throw new Error(message);
      }

      let result = await response.json();

      // ASYNC POLLING SUPPORT: If backend returns a jobId, we must poll for completion
      if (result.jobId) {
        const jobId = result.jobId;
        setStatusMessage("Job Queued. Waiting for worker...");

        // Poll loop
        let attempts = 0;
        while (true) {
          if (attempts > 300) throw new Error("Processing timed out (10m limit)"); // Safety break
          await new Promise(r => setTimeout(r, 2000)); // Sleep 2s
          attempts++;

          const statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!statusRes.ok) {
            console.warn("Status check failed, retrying...");
            continue;
          }

          const statusData = await statusRes.json();
          console.log(`Job ${jobId} status: ${statusData.status}`);

          if (statusData.status === "failed") {
            throw new Error(statusData.error || "Processing failed on server");
          }

          if (statusData.status === "completed") {
            result = statusData.result; // Swap initial result with final result
            break;
          }

          // Updates
          const progress = statusData.progress || 0;
          setStatusMessage(`Processing Video... ${progress}%`); // Dynamic updates
        }
      }

      setStatusMessage(`Success! Remaining Credits: ${result.remainingCredits}`);

      // If we got Viral Clips back (check both top-level and nested scenarios), switch to Studio Mode
      const suggestions = result.clipSuggestions || (result.data && result.data.clipSuggestions);

      if (suggestions && suggestions.length > 0) {
        setClipSuggestions(suggestions);
        setProcessing(false);
        return;
      }

      // Cleanup the temporary source file immediately to save space
      // Only do this if we uploaded a file (targetFile was Blob/File)
      if (tempUploadRef) {
        try {
          await deleteObject(tempUploadRef).catch(() => {});
          console.log("Deleted temporary source upload");
        } catch (cleanupError) {}
      } else if (fileUrl && fileUrl.includes("temp_uploads") && targetFile.url) {
        // If we used a previous result which was also temp, maybe clean it?
        // But we might need it if user hits 'undo'. Let's keep it for now.
        // Or rely on lifecycle rules.
      }

      if (result.url) {
        // Force UI refresh by ensuring the URL is treated as new (even if same filename)
        // Though in our backend we use timestamped filenames, caching can still be aggressive.
        const urlWithCacheBuster = result.url.includes("?")
          ? `${result.url}&t=${Date.now()}`
          : `${result.url}?t=${Date.now()}`;

        setVideoSrc(urlWithCacheBuster);
        // Fetch the blob so we can save it back to parent if needed
        // Or just keep the URL if parent supports it. For now, try to get blob.
        try {
          // Note: This fetch might fail if CORS is not configured on the Storage bucket.
          // If it fails, we will wrap the URL in a File-like object or pass the URL directly.
          const videoBlob = await fetch(result.url, { mode: "cors" }).then(r => {
            if (!r.ok) throw new Error("Fetch failed");
            return r.blob();
          });
          // Update state so next step uses THIS new file instead of original
          const newFile = new File([videoBlob], "processed_video.mp4", { type: "video/mp4" });
          setProcessedFile(newFile);
        } catch (e) {
          console.warn("Could not fetch blob. Chaining URL for next step.");
          const fakeFile = {
            name: "processed_video_remote.mp4",
            type: "video/mp4",
            url: result.url,
            isRemote: true,
          };
          setProcessedFile(fakeFile);
        }
      }
    } catch (error) {
      console.error("Processing error:", error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = () => {
    // Return the processed file (or original if failed/skipped) to the parent form
    if (processedFile) {
      onSave(processedFile);
    } else {
      onSave(file);
    }
  };

  const handleViralRender = async (selectedClip, overlays) => {
    setStatusMessage("Rendering your viral clip with overlays...");
    setProcessing(true);
    setClipSuggestions(null); // Close studio but keep processing state

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in.");
      const token = await user.getIdToken();

      // FIX: Ensure videoSrc is a Real URL (Firebase/Cloud), not a Local Blob.
      // If it's a blob, we must upload it first.
      let finalVideoUrl = videoSrc;
      if (videoSrc.startsWith("blob:")) {
        setStatusMessage("Uploading local video to cloud for processing...");
        const blob = await fetch(videoSrc).then(r => r.blob());
        const auth = getAuth();
        const storage = getStorage();
        const fileName = `temp_uploads/${auth.currentUser.uid}/${Date.now()}_source.mp4`;
        const fileRef = ref(storage, fileName);
        await uploadBytes(fileRef, blob);
        finalVideoUrl = await getDownloadURL(fileRef);
        console.log("Uploaded local blob to:", finalVideoUrl);
      }

      // Prepare payload
      const payload = {
        videoUrl: finalVideoUrl,
        clipTime: { start: selectedClip.start, end: selectedClip.end },
        overlays: overlays,
        options: { ...options, renderViral: true, analyzeClips: false }, // Force analyzeClips to false for rendering!
      };

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: finalVideoUrl, // Re-send main URL
          options: { ...options, renderViral: true, analyzeClips: false, viralData: payload }, // Force here too
        }),
      });

      if (!response.ok) {
        const debugText = await response.text();
        console.error("Backend Error Text:", debugText);
        try {
          const errJson = JSON.parse(debugText);
          throw new Error(errJson.detail || errJson.message || "Rendering failed");
        } catch (e) {
          throw new Error(`Rendering failed: ${response.status} ${response.statusText}`);
        }
      }

      let result = await response.json();

      // ASYNC POLLING (Viral Clip Render)
      if (result.jobId) {
        const jobId = result.jobId;
        setStatusMessage("Queued for Rendering...");

        let attempts = 0;
        while (true) {
          if (attempts > 300) throw new Error("Rendering timed out");
          await new Promise(r => setTimeout(r, 2000));
          attempts++;

          const statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!statusRes.ok) continue;
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            throw new Error(statusData.error || "Rendering failed on server");
          }

          if (statusData.status === "completed") {
            result = statusData.result;
            break;
          }

          setStatusMessage(`Rendering Clip... ${statusData.progress || 0}%`);
        }
      }
      // Update the main editor with the final rendered clip
      if (result.url) {
        const urlWithCacheBuster = `${result.url}?t=${Date.now()}`;
        setVideoSrc(urlWithCacheBuster);
        const fakeFile = {
          name: `viral_clip_rendered.mp4`,
          type: "video/mp4",
          url: result.url,
          isRemote: true,
        };
        setProcessedFile(fakeFile);
        setStatusMessage("Viral Clip Rendered! Ready to Save.");
      } else {
        console.error("Rendering succeeded but no URL returned:", result);
        setStatusMessage("Error: Server returned success but no video URL.");
        alert("Server error: No video URL returned. Check console for details.");
      }
    } catch (error) {
      console.error("Viral Render Error:", error);
      let msg = error.message;
      if (msg === "Failed to fetch") msg = "Network error. Is the backend running?";
      setStatusMessage("Error rendering clip: " + msg);
      alert("Error rendering clip: " + msg);
      // Do NOT re-open studio automatically, let user decide
      // setClipSuggestions(options.clipSuggestions);
    } finally {
      setProcessing(false);
    }
  };

  if (clipSuggestions) {
    return (
      <ViralClipStudio
        videoUrl={videoSrc}
        clips={clipSuggestions}
        onSave={handleViralRender}
        onCancel={() => setClipSuggestions(null)}
        onStatusChange={setStatusMessage}
        // Pass down music state
        currentMusic={options.musicFile}
        onMusicChange={(newMusic, isSearchMode) => {
          setOptions(prev => ({ ...prev, musicFile: newMusic, isSearch: isSearchMode }));
        }}
      />
    );
  }

  return (
    <div className="video-editor-container">
      <div className="video-editor-header">
        <h2>✨ Smart AI Video Editor (Phase 1)</h2>
        <button className="close-btn" onClick={onCancel}>
          &times;
        </button>
      </div>

      <div className="editor-layout">
        <div className="video-preview">
          {videoSrc ? (
            <video ref={videoRef} src={videoSrc} controls />
          ) : (
            <div className="loading-placeholder">Loading Video...</div>
          )}
        </div>

        <div className="ai-controls">
          <h3>AI Enhancements</h3>

          <div className="options-list">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.muteAudio}
                  onChange={() => toggleOption("muteAudio")}
                />
                <div className="option-label">
                  <div className="option-title">🔇 Mute Audio</div>
                  <div className="option-desc">Remove all original sound</div>
                </div>
              </label>

              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.addMusic}
                  onChange={() => toggleOption("addMusic")}
                />
                <div className="option-label">
                  <div className="option-title">🎵 Add Background Music</div>
                  <div className="option-desc">
                    {options.addMusic ? (
                      <div
                        className="music-selection"
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: "10px" }}
                      >
                        <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                          <label
                            style={{
                              fontSize: "13px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="radio"
                              name="musicType"
                              checked={!options.isSearch}
                              onChange={() =>
                                setOptions({
                                  ...options,
                                  isSearch: false,
                                  musicFile: "upbeat_pop.mp3",
                                })
                              }
                              style={{ marginRight: "5px" }}
                            />
                            Preset
                          </label>
                          <label
                            style={{
                              fontSize: "13px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="radio"
                              name="musicType"
                              checked={options.isSearch}
                              onChange={() =>
                                setOptions({ ...options, isSearch: true, musicFile: "" })
                              }
                              style={{ marginRight: "5px" }}
                            />
                            Search (YouTube)
                          </label>
                        </div>

                        {!options.isSearch ? (
                          <select
                            value={options.musicFile}
                            onChange={e => setOptions({ ...options, musicFile: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              borderRadius: "4px",
                              border: "1px solid #ccc",
                            }}
                          >
                            <option value="upbeat_pop.mp3">Upbeat Pop</option>
                            <option value="lofi_chill.mp3">Lofi Chill</option>
                            <option value="cinematic.mp3">Cinematic</option>
                            <option value="corporate.mp3">Corporate</option>
                          </select>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <input
                              type="text"
                              placeholder="Type song or genre (e.g. 'Amapiano Beats')"
                              value={options.musicFile}
                              onChange={e => setOptions({ ...options, musicFile: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "6px",
                                borderRadius: "4px",
                                border: "1px solid #ccc",
                              }}
                            />

                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                marginTop: "6px",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={options.safeSearch}
                                onChange={e =>
                                  setOptions({ ...options, safeSearch: e.target.checked })
                                }
                                style={{ marginRight: "6px" }}
                              />
                              Enable Copyright Protection (Royalty-Free Only)
                            </label>

                            {options.safeSearch ? (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "#4caf50",
                                  marginLeft: "20px",
                                  fontStyle: "italic",
                                }}
                              >
                                ✅ Safe from strikes. Might not find famous songs.
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "#ff5722",
                                  marginLeft: "20px",
                                  fontStyle: "italic",
                                }}
                              >
                                ⚠️ Risks account suspension if used on YouTube/TikTok.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      "Add music track (select genre or search)"
                    )}
                  </div>
                </div>
              </label>

              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.smartCrop}
                  onChange={() => toggleOption("smartCrop")}
                />
                <div className="option-label">
                  <div className="option-title">📱 Smart Crop (9:16)</div>
                  <div className="option-desc">Transform horizontal video to vertical</div>
                </div>
              </label>

              {options.smartCrop && (
                <div className="sub-options" style={{ paddingLeft: "34px", paddingBottom: "10px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "13px",
                      marginBottom: "8px",
                      cursor: "pointer",
                      color: options.cropStyle === "blur" ? "#fff" : "#aaa",
                    }}
                  >
                    <input
                      type="radio"
                      name="cropStyle"
                      value="blur"
                      checked={options.cropStyle === "blur"}
                      onChange={() => setOptions(prev => ({ ...prev, cropStyle: "blur" }))}
                      style={{ marginRight: "8px", accentColor: "#7c4dff" }}
                    />
                    <div>
                      <strong>Safe Fit (Blur Background)</strong>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        Essential for UI/Screen Recordings
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "13px",
                      cursor: "pointer",
                      color: options.cropStyle === "zoom" ? "#fff" : "#aaa",
                    }}
                  >
                    <input
                      type="radio"
                      name="cropStyle"
                      value="zoom"
                      checked={options.cropStyle === "zoom"}
                      onChange={() => {
                        console.log("User selected ZOOM style");
                        setOptions(prev => ({ ...prev, cropStyle: "zoom" }));
                      }}
                      style={{ marginRight: "8px", accentColor: "#7c4dff" }}
                    />
                    <div>
                      <strong>Full Zoom (Center Copy)</strong>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        Best for Talking Heads/Vlogs
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.silenceRemoval}
                onChange={() => toggleOption("silenceRemoval")}
              />
              <div className="option-label">
                <div className="option-title">✂️ Remove Silence</div>
                <div className="option-desc">Cuts dead air & pauses automatically</div>
              </div>
            </label>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.captions}
                onChange={() => toggleOption("captions")}
              />
              <div className="option-label">
                <div className="option-title">📝 AI Captions & Subtitles</div>
                <div className="option-desc">
                  Auto-detects language (English, Zulu, Xhosa, Afrikaans, etc.)
                </div>
              </div>
            </label>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.addHook}
                onChange={() =>
                  setOptions(prev => ({ ...prev, addHook: !prev.addHook, analyzeClips: false }))
                }
              />
              <div className="option-label">
                <div className="option-title">🎣 Add Viral Hook (Split-Second)</div>
                <div className="option-desc">Stops the scroll with an explosive intro text</div>
              </div>
            </label>

            {options.addHook && (
              <div
                style={{
                  marginLeft: "36px",
                  marginTop: "-8px",
                  marginBottom: "12px",
                  background: "#222",
                  padding: "8px",
                  borderRadius: "0 0 8px 8px",
                }}
              >
                <input
                  type="text"
                  value={options.hookText}
                  onChange={e => setOptions(prev => ({ ...prev, hookText: e.target.value }))}
                  placeholder="e.g. 3 Secrets They Don't Want You To Know..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    background: "#000",
                    color: "#fff",
                  }}
                />
              </div>
            )}

            <label
              className="ai-option viral-studio-option"
              style={{
                background: options.analyzeClips
                  ? "linear-gradient(45deg, #FF512F, #DD2476)"
                  : "#2a2a2a",
                border: options.analyzeClips ? "2px solid #fff" : "1px solid #444",
                transform: options.analyzeClips ? "scale(1.02)" : "scale(1)",
                boxShadow: options.analyzeClips ? "0 4px 15px rgba(221, 36, 118, 0.4)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <input
                type="checkbox"
                checked={options.analyzeClips}
                onChange={() => {
                  // Exclusive Logic: Turn OFF all other AI options if enabled
                  if (!options.analyzeClips) {
                    setOptions(prev => ({
                      ...prev,
                      analyzeClips: true,
                      smartCrop: false,
                      silenceRemoval: false,
                      captions: false,
                      muteAudio: false,
                      addMusic: false,
                      addHook: false,
                      musicFile: "",
                    }));
                  } else {
                    toggleOption("analyzeClips");
                  }
                }}
              />
              <div className="option-label">
                <div className="option-title" style={{ fontWeight: "800", fontSize: "1.1em" }}>
                  🔥 Viral Clip Studio
                </div>
                <div className="option-desc">
                  Launch the full multi-track editor & viral moment finder
                </div>
              </div>
            </label>
          </div>

          <div className="status-message-container">
            {statusMessage && (
              <div className="status-message">
                {processing && <span className="spinner">⏳ </span>}
                {statusMessage}
              </div>
            )}
          </div>

          <button
            className="process-btn"
            onClick={handleProcess}
            disabled={
              processing ||
              (!options.smartCrop &&
                !options.silenceRemoval &&
                !options.captions &&
                !options.muteAudio &&
                !options.addMusic &&
                !options.analyzeClips &&
                !options.addHook)
            }
          >
            {processing ? "Processing..." : "✨ Run AI Magic"}
          </button>

          <div className="video-actions">
            <button className="cancel-btn" onClick={onCancel} disabled={processing}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave} disabled={processing}>
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoEditor;
