/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
// import { FFmpeg } from "@ffmpeg/ffmpeg"; // Commented out to fix build warning, loaded via CDN
import { fetchFile, toBlobURL } from "@ffmpeg/util";
// Mock FFmpeg class acting as wrapper for CDN loaded instance
class FFmpegWrapper {
  constructor() {
    this.instance = null;
  }
  async load(config) {
    if (!window.FFmpeg) await loadFFmpegScript();
    this.instance = new window.FFmpeg.FFmpeg();
    await this.instance.load(config);
  }
  async writeFile(name, data) {
    return this.instance.writeFile(name, data);
  }
  async readFile(name) {
    return this.instance.readFile(name);
  }
  async exec(args) {
    return this.instance.exec(args);
  }
  on(event, callback) {
    if (this.instance) this.instance.on(event, callback);
  }
}
const FFmpeg = FFmpegWrapper;

// import { pipeline } from "@xenova/transformers"; // Removed to fix build warning, loaded via CDN instead

import "./VideoEditor.css";

// Helper to load FFmpeg
const loadFFmpegScript = async () => {
  if (window.FFmpeg) return window.FFmpeg;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js"; // Use UMD build
    script.async = true;
    script.onload = () => {
      if (window.FFmpeg) resolve(window.FFmpeg);
      else reject(new Error("FFmpeg not found on window"));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Helper to load Xenova dynamically if not present
const loadXenova = async () => {
  if (window.pipeline) return { pipeline: window.pipeline }; // Already loaded globally
  if (window.transformers) return window.transformers;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";
    script.async = true;

    script.onload = () => {
      // Check what it exposed
      if (window.transformers) resolve(window.transformers);
      else if (window.pipeline) resolve({ pipeline: window.pipeline });
      // Some builds might expose it differently, let's assume one of these works.
      // If module based, it might be harder via script tag, but CDN usually provides UMD.
      // Fallback: Check for esm usage by user, but here we expect UMD.
      else reject(new Error("Failed to load Xenova transformers: Global variable not found"));
    };
    script.onerror = () => reject(new Error("Failed to load Xenova script"));
    document.head.appendChild(script);
  });
};

function VideoEditor({ file, onSave, onCancel }) {
  const [ffmpeg] = useState(new FFmpeg());
  const [loaded, setLoaded] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Time range
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeOverlay, setActiveOverlay] = useState("none"); // none, tiktok, instagram, youtube
  const [viralityScore, setViralityScore] = useState(0);
  const [viralityMetrics, setViralityMetrics] = useState([]);
  const [boostQuality, setBoostQuality] = useState(false); // The "Use VP9" Hack

  // NEW: Audio & Captions
  const [enhanceAudio, setEnhanceAudio] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionColor, setCaptionColor] = useState("white");
  const [transcribing, setTranscribing] = useState(false);
  const [translateToEnglish, setTranslateToEnglish] = useState(false); // New Translation Toggle

  const videoRef = useRef(null);
  const messageRef = useRef(null);

  const load = async () => {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    try {
      // Load ffmpeg.wasm from a CDN (or local public folder if configured)
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      // Load Font for Captions (Roboto Bold)
      const fontURL =
        "https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Bold.ttf";
      try {
        await ffmpeg.writeFile("arial.ttf", await fetchFile(fontURL));
        log("Fonts loaded");
      } catch (e) {
        log("Font load warning: Captions might fail if not retried.");
      }

      setLoaded(true);
      log("FFmpeg loaded");
    } catch (e) {
      console.error(e);
      log("Failed to load FFmpeg: " + e.message);
    }
  };

  const log = msg => {
    if (messageRef.current) {
      messageRef.current.textContent = msg;
    }
    console.log(msg);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (file && loaded) {
      // Create object URL for preview
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, loaded]);

  const handleMetadataLoaded = e => {
    const dur = e.target.duration;
    setDuration(dur);
    setEndTime(dur);
    setStartTime(0);
    calculateVirality(e.target);
  };

  const calculateVirality = videoEl => {
    let score = 50; // Base score
    const metrics = [];

    // Duration Check (using videoEl.duration or state duration)
    const d = videoEl.duration || duration;
    if (d >= 8 && d <= 60) {
      score += 25;
      metrics.push("✅ Perfect Viral Length (8-60s)");
    } else if (d < 5) {
      score -= 10;
      metrics.push("❌ Too Short (<5s)");
    } else {
      metrics.push("⚠️ Long Form (High Retention req.)");
    }

    // Resolution/Format Check
    if (videoEl) {
      const { videoWidth, videoHeight } = videoEl;
      const ratio = videoWidth / videoHeight;

      if (ratio < 0.6) {
        // ~9:16
        score += 20;
        metrics.push("✅ Vertical 9:16 (Shorts/Reels)");
      } else if (ratio > 1.7) {
        // ~16:9
        score += 10;
        metrics.push("✅ Cinematic 16:9");
      } else {
        score -= 10;
        metrics.push("⚠️ Square/Boxy (Lower Reach)");
      }

      if (videoHeight >= 1080) {
        score += 5;
        // metrics.push("✅ HD Quality");
      } else {
        score -= 10;
        metrics.push("⚠️ Low Res (<1080p). Quality loss likely.");
      }
    }

    setViralityScore(Math.min(99, Math.max(1, score)));
    setViralityMetrics(metrics);
  };

  const handleAutoTranscribe = async () => {
    if (!videoSrc) return;
    setTranscribing(true);
    log("🧠 Loading Multilingual AI Model (Whisper)...");

    try {
      // Load library via script tag injection safely (avoids Babel/Webpack dynamic import issues)
      const transformers = await loadXenova();
      const pipeline = transformers.pipeline || window.pipeline;

      if (!pipeline) throw new Error("Transformers pipeline not found in window or module export");

      // Upgrade to 'whisper-tiny' (Multilingual) instead of 'whisper-tiny.en'
      const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      // const transcriber = null;

      log(
        translateToEnglish
          ? "👂 Listening & Translating to English..."
          : "👂 Listening (Auto-Detect Language)..."
      );

      // Pass options: language 'id' means auto-detect. task 'translate' forces English output.
      const options = {
        task: translateToEnglish ? "translate" : "transcribe",
        chunk_length_s: 30,
      };

      const result = await transcriber(videoSrc, options);

      console.log("Transcription result:", result);
      if (result && result.text) {
        setCaptionText(result.text.trim());
        log("✅ Transcription Complete!");
      } else {
        log("⚠️ No text detected.");
      }
    } catch (e) {
      log("❌ Transcription failed: " + e.message);
      if (e && e.message && e.message.includes("audio")) {
        log("Tip: Ensure the video has an audio track.");
      }
      console.error(e);
    } finally {
      setTranscribing(false);
    }
  };

  const handleTrim = async () => {
    if (!loaded) return;
    setProcessing(true);
    const inputName = "input.mp4";
    const outputName = "output.mp4";

    try {
      // Write file to memory
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const args = ["-i", inputName, "-ss", startTime.toString(), "-to", endTime.toString()];

      // --- FILTER CHAINS ---
      const videoFilters = [];
      const audioFilters = [];

      // 1. VIDEO FILTERS
      if (boostQuality) {
        if (activeOverlay === "youtube") {
          videoFilters.push("scale=2560:1440:flags=lanczos");
        } else if (["tiktok", "instagram"].includes(activeOverlay)) {
          videoFilters.push("scale=1080:-2:flags=lanczos");
        }
      }

      if (captionText) {
        // Draw text centered at bottom (with safe padding)
        // Escape single quotes for ffmpeg command string
        const sanitizedText = captionText.replace(/'/g, "");
        const fontColor = captionColor === "yellow" ? "yellow" : "white";

        // Bottom center position: x=(w-tw)/2, y=h-(h*0.15)
        videoFilters.push(
          `drawtext=fontfile=/arial.ttf:text='${sanitizedText}':fontcolor=${fontColor}:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=(h-text_h)-150`
        );
      }

      if (videoFilters.length > 0) {
        args.push("-vf", videoFilters.join(","));
      }

      // 2. AUDIO FILTERS (Studio Voice)
      if (enhanceAudio) {
        // Highpass (remove rumble) + Compressor (loudness) + EQ (clarity)
        // "firequalizer" is often missing in light builds, so uses simple low/high pass + compand
        log("Applying Studio Mic Enhancement...");
        // Acompressor: threshold -12dB, ratio 4:1 (speech standard), makeup 2dB
        audioFilters.push(
          "highpass=f=80,acompressor=threshold=-12dB:ratio=4:attack=50:release=200"
        );
      }

      if (audioFilters.length > 0) {
        args.push("-af", audioFilters.join(","));
      }

      // --- ENCODING SETTINGS ---
      if (videoFilters.length > 0 || boostQuality) {
        // Must re-encode if we used filters
        args.push("-c:v", "libx264");
        args.push("-preset", "ultrafast");

        if (boostQuality && ["tiktok", "instagram"].includes(activeOverlay)) {
          // High profile for better quality at same bitrate
          args.push("-profile:v", "high");
          args.push("-b:v", "15M");
        } else if (boostQuality) {
          args.push("-b:v", "15M");
        }
      } else {
        // No video filters? Stream copy video is fastest
        args.push("-c:v", "copy");
      }

      if (audioFilters.length > 0) {
        // Re-encode audio (AAC default)
        args.push("-c:a", "aac");
      } else {
        args.push("-c:a", "copy");
      }

      args.push(outputName);

      // Run command
      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      const newBlob = new Blob([data.buffer], { type: "video/mp4" });

      // Rename if possible
      const newFile = new File([newBlob], `trimmed_${file.name}`, { type: "video/mp4" });

      onSave(newFile);
    } catch (err) {
      console.error(err);
      log("Error processing video");
    } finally {
      setProcessing(false);
      // Clean up memory
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {}
    }
  };

  if (!file) return null;

  return (
    <div className="video-editor-container">
      <h3>Trim Video</h3>
      {!loaded ? (
        <div className="loading-state">Loading FFmpeg core...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "20px", marginBottom: "16px" }}>
            <div
              className="virality-hud"
              style={{
                flex: 1,
                background: "#f0fdf4",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
              }}
            >
              <h4 style={{ margin: 0, color: "#166534" }}>
                🚀 Virality Potential: {viralityScore}/100
              </h4>
              <ul
                style={{
                  margin: "5px 0 0 0",
                  paddingLeft: "20px",
                  fontSize: "0.8rem",
                  color: "#15803d",
                }}
              >
                {viralityMetrics.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>

            <div
              className="quality-hud"
              style={{
                flex: 1,
                background: "#eff6ff",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #bfdbfe",
              }}
            >
              <h4 style={{ margin: 0, color: "#1e40af" }}>✨ Quality Guard</h4>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  marginTop: "5px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={boostQuality}
                  onChange={e => setBoostQuality(e.target.checked)}
                />
                <span>
                  {activeOverlay === "youtube"
                    ? "Force 1440p Upscale (VP9 Hack)"
                    : ["tiktok", "instagram"].includes(activeOverlay)
                      ? "Crisp 1080p (Prevent Compression)"
                      : "Enhance Bitrate"}
                </span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  marginTop: "5px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={enhanceAudio}
                  onChange={e => setEnhanceAudio(e.target.checked)}
                />
                <span>
                  <b>🎙️ Studio Mic Enhancer</b> (Compressor + Highpass)
                </span>
              </label>
            </div>
          </div>

          <div
            style={{
              marginBottom: "16px",
              padding: "10px",
              border: "1px solid #eee",
              borderRadius: "8px",
            }}
          >
            <h4 style={{ margin: "0 0 8px 0" }}>📝 Quick Captions</h4>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={handleAutoTranscribe}
                disabled={transcribing}
                style={{
                  padding: "8px 12px",
                  background: transcribing ? "#ddd" : "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: transcribing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title="Auto-detect speech using AI"
              >
                {transcribing ? "👂 Processing..." : "✨ Auto-Transcribe"}
              </button>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="Convert any language to English text"
              >
                <input
                  type="checkbox"
                  checked={translateToEnglish}
                  onChange={e => setTranslateToEnglish(e.target.checked)}
                />
                <span>Translate to English</span>
              </label>

              <input
                type="text"
                className="time-input input" // reusing class
                style={{ flex: 1, width: "auto" }}
                placeholder="Enter caption text..."
                value={captionText}
                onChange={e => setCaptionText(e.target.value)}
              />
              <select
                value={captionColor}
                onChange={e => setCaptionColor(e.target.value)}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
              >
                <option value="white">White</option>
                <option value="yellow">Yellow</option>
              </select>
            </div>
            {captionText && (
              <small style={{ color: "#666" }}>
                Preview: Captions will be burned into the bottom center.
              </small>
            )}
          </div>

          <div className="overlay-controls">
            <span>🛡️ Safe Zone:</span>
            <button
              className={`btn-overlay ${activeOverlay === "none" ? "active" : ""}`}
              onClick={() => setActiveOverlay("none")}
            >
              Off
            </button>
            <button
              className={`btn-overlay ${activeOverlay === "tiktok" ? "active" : ""}`}
              onClick={() => setActiveOverlay("tiktok")}
            >
              TikTok
            </button>
            <button
              className={`btn-overlay ${activeOverlay === "instagram" ? "active" : ""}`}
              onClick={() => setActiveOverlay("instagram")}
            >
              Reels
            </button>
            <button
              className={`btn-overlay ${activeOverlay === "youtube" ? "active" : ""}`}
              onClick={() => setActiveOverlay("youtube")}
            >
              Shorts
            </button>
          </div>

          <div className="video-preview">
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              onLoadedMetadata={handleMetadataLoaded}
              width="100%"
            />
            {activeOverlay === "tiktok" && (
              <div className="safe-zone-overlay">
                <div className="danger-zone tiktok-top">Tabs</div>
                <div className="danger-zone tiktok-right">Buttons</div>
                <div className="danger-zone tiktok-bottom">Caption & Sound</div>
              </div>
            )}
            {activeOverlay === "instagram" && (
              <div className="safe-zone-overlay">
                <div className="danger-zone reels-top">Camera</div>
                <div className="danger-zone reels-right">Buttons</div>
                <div className="danger-zone reels-bottom">Details</div>
              </div>
            )}
            {activeOverlay === "youtube" && (
              <div className="safe-zone-overlay">
                <div className="danger-zone shorts-top">Search</div>
                <div className="danger-zone shorts-right">Actions</div>
                <div className="danger-zone shorts-bottom">Title</div>
              </div>
            )}
          </div>

          <div className="controls-row">
            <div className="time-input">
              <label>Start (sec):</label>
              <input
                type="number"
                value={startTime}
                step="0.1"
                min="0"
                max={endTime}
                onChange={e => {
                  setStartTime(Number(e.target.value));
                  if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                }}
              />
            </div>
            <div className="time-input">
              <label>End (sec):</label>
              <input
                type="number"
                value={endTime}
                step="0.1"
                min={startTime}
                max={duration}
                onChange={e => {
                  setEndTime(Number(e.target.value));
                  if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="editor-actions">
            <button className="btn-cancel" onClick={onCancel} disabled={processing}>
              Cancel
            </button>
            <button className="btn-save" onClick={handleTrim} disabled={processing}>
              {processing ? "Processing..." : "Trim & Save"}
            </button>
          </div>
          <p ref={messageRef} className="status-log"></p>
        </>
      )}
    </div>
  );
}

export default VideoEditor;
