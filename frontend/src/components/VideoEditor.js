/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
// import { FFmpeg } from "@ffmpeg/ffmpeg"; // Commented out to fix build warning, loaded via CDN
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import DOMPurify from "dompurify";
import "./VideoEditor.css";

// Helper to load FFmpeg
const loadFFmpegScript = async () => {
  if (window.FFmpegWASM) return window.FFmpegWASM;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Switch to unpkg to match core and avoid jsdelivr tracking blocks
    script.src = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.FFmpegWASM) resolve(window.FFmpegWASM);
      else reject(new Error("FFmpegWASM not found on window"));
    };
    script.onerror = () => reject(new Error("Failed to load FFmpeg script"));
    document.head.appendChild(script);
  });
};

// Helper to load Xenova dynamically via ESM import
const loadXenova = async () => {
  try {
    // Import directly from unpkg as an ES Module.
    // This avoids "Uncaught SyntaxError: Unexpected token 'export'" which happens
    // when loading an ESM file via a standard <script> tag.
    const transformers = await import(
      /* webpackIgnore: true */
      "https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js"
    );
    return transformers;
  } catch (error) {
    console.error("Xenova load error:", error);
    throw new Error("Failed to load Xenova transformers: " + error.message);
  }
};

// Mock FFmpeg class acting as wrapper for CDN loaded instance
class FFmpegWrapper {
  constructor() {
    this.instance = null;
  }
  async load(config) {
    if (!window.FFmpegWASM) await loadFFmpegScript();
    this.instance = new window.FFmpegWASM.FFmpeg();

    // Explicitly load the worker script, fetch it, and PATCH the imports to be absolute
    // before creating a Blob. This fixes "404 Not Found" (bad file path) and relative import errors in Blob.
    const baseURL = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm";
    const workerURL = `${baseURL}/worker.js`;

    // Fetch the worker code
    const workerResp = await fetch(workerURL);
    if (!workerResp.ok) throw new Error(`Failed to fetch worker: ${workerURL}`);
    let workerScript = await workerResp.text();

    // Patch relative imports to absolute URLs so they work in the Blob worker
    // Replaces: from "./const.js" -> from "https://.../const.js"
    workerScript = workerScript.replaceAll('from "./', `from "${baseURL}/`);

    // Create the Blob URL
    const workerBlob = new Blob([workerScript], { type: "text/javascript" });
    const workerBlobURL = URL.createObjectURL(workerBlob);

    await this.instance.load({
      ...config,
      // Pass the worker blob URL to bypass security checks and load our patched worker
      classWorkerURL: workerBlobURL,
    });
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

function VideoEditor({ file, onSave, onCancel, images = [] }) {
  // Console noise suppression for ONNX Runtime
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      // Filter out technical ONNX warnings that aren't relevant to the user
      if (
        args.some(
          arg =>
            typeof arg === "string" &&
            (arg.includes("Removing initializer") ||
              arg.includes("CleanUnusedInitializersAndNodeArgs"))
        )
      ) {
        return;
      }
      originalWarn.apply(console, args);
    };
    return () => {
      console.warn = originalWarn;
    };
  }, []);

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
  const [hasTranscribed, setHasTranscribed] = useState(false); // Prevent loops

  const videoRef = useRef(null);
  const messageRef = useRef(null);

  const log = msg => {
    if (messageRef.current) {
      messageRef.current.textContent = msg;
    }
    console.log(msg);
  };

  const load = async () => {
    // Standardize to use unpkg for consistency
    // Use ESM core because the worker is now running as a module
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    // The worker (loaded as blob) can import scripts from unpkg (CORS enabled)
    const coreURL = `${baseURL}/ffmpeg-core.js`;
    const wasmURL = `${baseURL}/ffmpeg-core.wasm`;

    try {
      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
      });

      // Load Font for Captions (Arial from FFmpeg WASM test data - reliable)
      const fontURL = "https://raw.githubusercontent.com/ffmpegwasm/testdata/master/arial.ttf";
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Security: Sanitize sensitive sinks to prevent XSS (CodeQL #969, #970, #971, #973)
  // Although React escapes content, explicit validation satisfies strict scanners.
  // We use DOMPurify to guarantee no HTML payload exists in the data.
  const safeVideoSrc = React.useMemo(() => {
    if (!videoSrc) return "";
    // Strict Protocol Whitelist
    if (/^(blob:|https?:)/i.test(videoSrc)) return videoSrc;
    // For data URIs, we ensure they are strictly image/video/audio
    if (/^data:(image|video|audio)\//i.test(videoSrc)) return videoSrc;

    console.warn("Blocked potentially unsafe video source", videoSrc);
    return "";
  }, [videoSrc]);

  const safeCaptionText = React.useMemo(() => {
    if (!captionText) return null;
    // Double-sanitization: Cast to string AND strip HTML tags
    return DOMPurify.sanitize(String(captionText), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }, [captionText]);

  // --- VFX Engine ---
  const [isVFXMode, setIsVFXMode] = useState(false);
  const vfxCanvasRef = useRef(null);
  const vfxAppRef = useRef(null);

  useEffect(() => {
    if (isVFXMode && vfxCanvasRef.current && videoRef.current) {
      log("Initializing VFX Engine...");
      // Lazy load to avoid crash if path correct
      import("../vfx/VFXEngine")
        .then(({ initVFXEngine }) => {
          return initVFXEngine(vfxCanvasRef.current, videoRef.current);
        })
        .then(app => {
          vfxAppRef.current = app;
          log("VFX Engine Active: Cyberpunk Shader Loaded");
        })
        .catch(err => {
          console.error("VFX Init Failed", err);
          log("VFX Engine Failed: " + err.message);
          setIsVFXMode(false);
        });

      return () => {
        if (vfxAppRef.current) {
          vfxAppRef.current.destroy();
          vfxAppRef.current = null;
        }
      };
    }
  }, [isVFXMode, safeVideoSrc]);
  // ------------------

  useEffect(() => {
    if (loaded) {
      if (file) {
        // Video Mode
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        setHasTranscribed(false);
        setCaptionText("");
        setStartTime(0);
        setEndTime(0);
        return () => URL.revokeObjectURL(url);
      } else if (images && images.length > 0) {
        // Slideshow Mode
        const url = URL.createObjectURL(images[currentImageIndex]);
        setVideoSrc(url);
        // Only set default text once
        if (captionText === "") {
          setCaptionText("Slideshow: Add audio to generate captions");
        }
        log(`🎬 Slideshow Mode: Showing image ${currentImageIndex + 1} of ${images.length}`);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file, images, loaded, currentImageIndex]); // Added currentImageIndex dependency

  useEffect(() => {
    // Auto-transcribe once video source is ready
    if (videoSrc && !hasTranscribed && !transcribing && loaded) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleAutoTranscribe();
      }, 1000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, hasTranscribed, loaded]);

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
    // Only show log if manually triggered or first time
    if (!hasTranscribed) log("✨ Auto-generating Captions...");

    try {
      // Load library via script tag injection safely
      const transformers = await loadXenova();
      const pipeline = transformers.pipeline || window.pipeline;
      const env = transformers.env || window.transformers.env;

      if (env) {
        // Disable local model checks to prevent 404 errors on autopromote.org
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        // Suppress ONNX runtime warnings to clean up console
        if (env.backends && env.backends.onnx) {
          env.backends.onnx.logLevel = "fatal";
        }
      }

      if (!pipeline) throw new Error("Transformers pipeline not found in window or module export");

      const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");

      const options = {
        task: translateToEnglish ? "translate" : "transcribe",
        chunk_length_s: 30,
        return_timestamps: true, // Critical for Hook Analysis
      };

      const result = await transcriber(videoSrc, options);

      console.log("Transcription result:", result);
      if (result && result.text) {
        let text = result.text.trim();
        const lower = text.toLowerCase();

        // --- ALGORITHM GUARD: 3-Second Hook Analysis ---
        // Verify if the first meaningful spoken chunk starts within the first 3 seconds.
        if (result.chunks && result.chunks.length > 0) {
          const firstChunk = result.chunks[0];
          const [start, end] = firstChunk.timestamp;

          // If the first word appears after 3 seconds, it's a retention killer.
          if (start > 3.0) {
            log("⚠️ ALGORITHM ALERT: First 3 seconds are silent. This kills retention.");
            setViralityScore(prev => Math.max(0, prev - 25)); // Heavy penalty
            setViralityMetrics(prev => [
              ...prev,
              "❌ Slow Start (>3s silence) - Cut the beginning!",
            ]);
            // Auto-suggest trim if not already set? (Advanced)
            if (startTime === 0) {
              setStartTime(start);
              log(`💡 Auto-suggestion: Trim start to ${start}s`);
            }
          } else {
            log("✅ Hook Check: Audio starts immediately.");
            setViralityMetrics(prev => [...prev, "✅ Fast Hook (<3s)"]);
          }
        }

        // Smart Audio Intelligence: Distinguish between Hallucinations and Real Audio Events
        const soundTags = {
          "(music)": "🎵 [Music Playing] 🎵",
          "(laughing)": "😂 [Laughter]",
          "(laughter)": "😂 [Laughter]",
          "(applause)": "👏 [Applause]",
          "(cheering)": "🙌 [Cheering]",
          "(silence)": "...", // Subtle indicator for silence if desired, or allow filtering
          "(no speech detected)": "",
        };

        const bannedHallucinations = [
          "subtitles by",
          "captioned by",
          "amara.org",
          "thank you",
          "you",
        ];

        let formattedText = text;
        let isHallucination = false;
        let isSoundEvent = false;

        // 1. Check for Sound Events (Music, Laughter)
        for (const [tag, replacement] of Object.entries(soundTags)) {
          if (lower.includes(tag)) {
            if (replacement === "") {
              isHallucination = true; // Treat specific tags like (no speech) as invisible
            } else {
              formattedText = replacement;
              isSoundEvent = true;
            }
            break;
          }
        }

        // 2. Check for common Whisper Hallucinations (only if not a valid sound event)
        if (!isSoundEvent) {
          if (bannedHallucinations.some(h => lower.includes(h)) && text.length < 25) {
            isHallucination = true;
          }
          if (text.length < 2) isHallucination = true; // Noise
        }

        if (isHallucination) {
          log("ℹ️ Filtered background noise/silence.");
          setCaptionText("");
        } else {
          setCaptionText(formattedText);
          log(`✅ Smart Caption: ${formattedText}`);
        }
      } else {
        log("⚠️ No text detected.");
      }
    } catch (e) {
      log("❌ Auto-caption failed (silent video?): " + e.message);
      console.error(e);
    } finally {
      setTranscribing(false);
      setHasTranscribed(true);
    }
  };

  const handleTrim = async () => {
    if (!loaded) return;
    setProcessing(true);
    const inputName = "input.mp4";
    const outputName = "output.mp4";

    try {
      if (images && images.length > 0) {
        // --- SLIDESHOW MODE ---
        log("🎬 Generating slideshow from images...");

        // 1. Write frames to FS
        for (let i = 0; i < images.length; i++) {
          const fname = `img${String(i).padStart(3, "0")}.jpg`;
          await ffmpeg.writeFile(fname, await fetchFile(images[i]));
        }

        // 2. Build FFmpeg command for slideshow
        // Framerate 1/3 means 1 frame every 3 seconds (3s per slide)
        // scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2
        // This ensures all images fit into a 9:16 vertical video (TikTok style) with black bars if needed
        const args = [
          "-framerate",
          "1/3",
          "-i",
          "img%03d.jpg",
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
          "-c:v",
          "libx264",
          "-r",
          "30", // Output 30fps
          "-pix_fmt",
          "yuv420p",
          outputName,
        ];

        // Note: Audio muxing logic would go here if we had an audio file

        log("⏳ Rendering Slideshow...");
        await ffmpeg.exec(args);
      } else if (isVFXMode && vfxCanvasRef.current) {
        // --- GPU VFX MODE ---
        // Capture WebGL Canvas + Original Audio + FFmpeg Muxing
        log("🎬 Starting GPU Render Capture...");
        const stream = vfxCanvasRef.current.captureStream(30);

        // Use MediaRecorder to capture the visual output
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        const chunks = [];

        await new Promise((resolve, reject) => {
          recorder.ondataavailable = e => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = resolve;
          recorder.onerror = reject;

          // Replay video to drive rendering
          videoRef.current.currentTime = 0;
          videoRef.current.play();
          recorder.start();

          videoRef.current.onended = () => {
            recorder.stop();
            videoRef.current.onended = null;
          };

          // Failsafe
          setTimeout(
            () => {
              if (recorder.state === "recording") recorder.stop();
            },
            videoRef.current.duration * 1000 + 2000
          );
        });

        const vfxBlob = new Blob(chunks, { type: "video/webm" });
        await ffmpeg.writeFile("vfx_capture.webm", await fetchFile(vfxBlob));
        await ffmpeg.writeFile(inputName, await fetchFile(file));

        // Mux: Visuals from Capture (0:v), Audio from Original (1:a)
        // Convert to MP4 for compatibility
        log("🔄 Muxing Audio & Converting...");
        await ffmpeg.exec([
          "-i",
          "vfx_capture.webm",
          "-i",
          inputName,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-shortest",
          outputName,
        ]);
      } else {
        // --- STANDARD VIDEO MODE ---
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
          const sanitizedText = captionText.replace(/'/g, "");
          const fontColor = captionColor === "yellow" ? "yellow" : "white";
          // Bottom center position check simplified for stability
          videoFilters.push(
            `drawtext=fontfile=/arial.ttf:text='${sanitizedText}':fontcolor=${fontColor}:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=(h-text_h)-150`
          );
        }

        if (videoFilters.length > 0) {
          args.push("-vf", videoFilters.join(","));
        }

        // 2. AUDIO FILTERS
        if (enhanceAudio) {
          log("Applying Studio Mic Enhancement + Loudness Normalization...");
          // Chain: Highpass (Cleanup) -> Compressor (Dynamics) -> Loudnorm (Algorithm Consistency)
          // loudnorm=I=-16:TP=-1.5:LRA=11 is the standard mobile/social target (slightly louder than broadcast)
          audioFilters.push(
            "highpass=f=80,acompressor=threshold=-12dB:ratio=4:attack=50:release=200,loudnorm=I=-16:TP=-1.5:LRA=11"
          );
        }

        if (audioFilters.length > 0) {
          args.push("-af", audioFilters.join(","));
        }

        // --- ENCODING SETTINGS ---
        if (videoFilters.length > 0 || boostQuality) {
          args.push("-c:v", "libx264");
          args.push("-preset", "ultrafast");
          if (boostQuality && ["tiktok", "instagram"].includes(activeOverlay)) {
            args.push("-profile:v", "high");
            args.push("-b:v", "15M");
          } else if (boostQuality) {
            args.push("-b:v", "15M");
          }
        } else {
          args.push("-c:v", "copy");
        }

        if (audioFilters.length > 0) {
          args.push("-c:a", "aac");
        } else {
          args.push("-c:a", "copy");
        }

        args.push(outputName);

        await ffmpeg.exec(args);
      }

      const data = await ffmpeg.readFile(outputName);
      const newBlob = new Blob([data.buffer], { type: "video/mp4" });

      // SEO Filename Generation: Use first 4-5 words of caption if available for Algorithm SEO
      let seoFilename = "";
      if (captionText) {
        seoFilename = captionText
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase()
          .split("_")
          .filter(w => w.length > 2)
          .slice(0, 5)
          .join("_");
      }
      if (!seoFilename) seoFilename = "viral_edit";

      const filename = file
        ? `${seoFilename}_${Date.now()}.mp4`
        : `slideshow_${seoFilename}_${Date.now()}.mp4`;
      const newFile = new File([newBlob], filename, { type: "video/mp4" });

      onSave(newFile);
    } catch (err) {
      console.error(err);
      log("Error processing video. Check console.");
    } finally {
      setProcessing(false);
      try {
        if (file) await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        // Clean up images if they exist
        if (images && images.length > 0) {
          for (let i = 0; i < images.length; i++) {
            try {
              await ffmpeg.deleteFile(`img${String(i).padStart(3, "0")}.jpg`);
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  };

  if (!file && (!images || images.length === 0)) return null;

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
                title="Regenerate captions using AI"
              >
                {transcribing
                  ? "👂 Processing..."
                  : hasTranscribed
                    ? "🔄 Regenerate"
                    : "✨ Auto-Transcribe"}
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
            {!file && images && images.length > 0 ? (
              <div
                className="slideshow-container"
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "9/16",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={safeVideoSrc}
                  alt={`Slide ${Number(currentImageIndex) + 1}`}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />

                {images.length > 1 && (
                  <div
                    className="slideshow-controls"
                    style={{
                      position: "absolute",
                      top: "50%",
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "0 10px",
                      pointerEvents: "auto",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <button
                      onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentImageIndex === 0}
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: "40px",
                        height: "40px",
                        cursor: currentImageIndex === 0 ? "default" : "pointer",
                        opacity: currentImageIndex === 0 ? 0.3 : 1,
                      }}
                    >
                      ◀
                    </button>
                    <button
                      onClick={() =>
                        setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1))
                      }
                      disabled={currentImageIndex === images.length - 1}
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: "40px",
                        height: "40px",
                        cursor: currentImageIndex === images.length - 1 ? "default" : "pointer",
                        opacity: currentImageIndex === images.length - 1 ? 0.3 : 1,
                      }}
                    >
                      ▶
                    </button>
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    color: "white",
                    background: "rgba(0,0,0,0.5)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  {currentImageIndex + 1} / {images.length}
                </div>
              </div>
            ) : (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <video
                  ref={videoRef}
                  src={safeVideoSrc}
                  controls
                  onLoadedMetadata={handleMetadataLoaded}
                  style={{
                    width: "100%",
                    // When VFX is on, we hide the video visually but keep it for audio/texture source
                    opacity: isVFXMode ? 0 : 1,
                    position: isVFXMode ? "absolute" : "relative",
                  }}
                  crossOrigin="anonymous"
                />

                {isVFXMode && (
                  <canvas
                    ref={vfxCanvasRef}
                    style={{
                      width: "100%",
                      height: "100%",
                      position: "relative", // Canvas takes the flow
                      pointerEvents: "none", // Let clicks pass to video controls if needed, though Opacity 0 makes it tricky
                    }}
                  />
                )}

                <div style={{ position: "absolute", top: 10, left: 10, zIndex: 100 }}>
                  <button
                    onClick={() => setIsVFXMode(!isVFXMode)}
                    className="btn btn-secondary"
                    style={{
                      background: isVFXMode ? "#ff00ff" : "#444",
                      border: "1px solid #fff",
                      color: "#fff",
                      fontWeight: "bold",
                      textShadow: "0 0 5px #000",
                    }}
                  >
                    {isVFXMode ? "⚡ VFX ENABLED (GPU)" : "👁️ VFX PREVIEW"}
                  </button>
                </div>
              </div>
            )}
            {safeCaptionText && (
              <div
                className="caption-preview-overlay"
                style={{
                  position: "absolute",
                  bottom: "15%", // Matches (h-text_h)-150 approx
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: captionColor,
                  fontFamily: "Arial, sans-serif",
                  fontSize: "clamp(16px, 4vw, 32px)", // Responsive font size
                  textShadow:
                    "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
                  textAlign: "center",
                  pointerEvents: "none",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  maxWidth: "90%",
                  zIndex: 20,
                }}
              >
                {safeCaptionText}
              </div>
            )}
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
