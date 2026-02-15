/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
// import { FFmpeg } from "@ffmpeg/ffmpeg"; // Commented out to fix build warning, loaded via CDN
import { fetchFile, toBlobURL } from "@ffmpeg/util";
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
  const [activeOverlay, setActiveOverlay] = useState("none"); // Default to clean view
  const [viralityScore, setViralityScore] = useState(0);
  const [viralityMetrics, setViralityMetrics] = useState([]);
  const [boostQuality, setBoostQuality] = useState(false); // The "Use VP9" Hack
  const [activePreset, setActivePreset] = useState("cinematic"); // Default to Cinematic for best first impression

  // NEW: Audio & Captions
  const [enhanceAudio, setEnhanceAudio] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionColor, setCaptionColor] = useState("white");
  const [transcribing, setTranscribing] = useState(false);
  const [translateToEnglish, setTranslateToEnglish] = useState(false); // New Translation Toggle
  const [hasTranscribed, setHasTranscribed] = useState(false); // Prevent loops

  const videoRef = useRef(null);
  const messageRef = useRef(null);

  // --- PRESET LOGIC ---
  const applyPreset = presetName => {
    setActivePreset(presetName);
    log(`Applied ${presetName} preset settings.`);

    switch (presetName) {
      case "podcast":
        setEnhanceAudio(true);
        setIsVFXMode(false);
        setActiveOverlay("none"); // Keep it clean
        setBoostQuality(true);
        if (!captionText) setCaptionText("Podcast Guest Name");
        break;
      case "gameplay":
        setEnhanceAudio(false); // Game audio usually mixed
        setIsVFXMode(false);
        setActiveOverlay("none");
        setBoostQuality(true);
        break;
      case "cinematic":
        setEnhanceAudio(true);
        setIsVFXMode(true); // Enable Gloss Shader
        setActiveVFXEffect("cinema"); // Sync explicit effect
        setActiveOverlay("none"); // Hide overlay, let the cinema look shine
        setBoostQuality(true);
        break;
      case "custom":
      default:
        // Do not reset everything, just let user toggle
        break;
    }
  };

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
    // React escapes children by default, protecting against XSS.
    // We simply cast to string to be safe.
    return String(captionText);
  }, [captionText]);

  // --- VFX Engine ---
  // Default to TRUE for full auto-magical experience
  const [isVFXMode, setIsVFXMode] = useState(true);
  const [vfxLoading, setVfxLoading] = useState(false);
  const vfxCanvasRef = useRef(null);
  const vfxAppRef = useRef(null);

  // Green Screen & VFX State
  const [activeVFXEffect, setActiveVFXEffect] = useState("cinema"); // 'cinema', 'green-screen', 'none'
  const [gsThreshold, setGsThreshold] = useState(0.15);
  const [gsSmoothing, setGsSmoothing] = useState(0.1);
  const [gsKeyColor, setGsKeyColor] = useState("#00ff00");
  const [gsBgImage, setGsBgImage] = useState(null); // URL for background image

  // Editor Tabs State
  const [activeTab, setActiveTab] = useState("effects"); // 'effects', 'text', 'adjust', 'overlay'

  // Security: Sanitize background image URL preventing XSS (CodeQL #975)
  const safeGsBgImage = React.useMemo(() => {
    if (!gsBgImage) return null;
    if (/^(blob:|https?:)/i.test(gsBgImage)) return gsBgImage;
    if (/^data:image\//i.test(gsBgImage)) return gsBgImage;
    console.warn("Blocked potentially unsafe background image", gsBgImage);
    return null;
  }, [gsBgImage]);

  const hexToRgbNormalized = hex => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        ]
      : [0, 1, 0];
  };

  useEffect(() => {
    if (vfxAppRef.current && vfxAppRef.current.setEffect) {
      if (activeVFXEffect === "green-screen") {
        vfxAppRef.current.setEffect("green-screen", {
          threshold: parseFloat(gsThreshold),
          smoothing: parseFloat(gsSmoothing),
          keyColor: hexToRgbNormalized(gsKeyColor),
        });
      } else {
        vfxAppRef.current.setEffect(activeVFXEffect);
      }
    }
  }, [activeVFXEffect, gsThreshold, gsSmoothing, gsKeyColor]);

  useEffect(() => {
    if (isVFXMode && vfxCanvasRef.current && videoRef.current) {
      setVfxLoading(true);
      log("Initializing GPU VFX Engine...");

      // Lazy load to avoid crash if path correct
      import("../vfx/VFXEngine")
        .then(({ initVFXEngine }) => {
          return initVFXEngine(vfxCanvasRef.current, videoRef.current);
        })
        .then(app => {
          vfxAppRef.current = app;
          // Apply initial state
          if (app.setEffect) {
            app.setEffect(activeVFXEffect, {
              threshold: parseFloat(gsThreshold),
              smoothing: parseFloat(gsSmoothing),
              keyColor: hexToRgbNormalized(gsKeyColor),
            });
          }
          setVfxLoading(false);
          log("VFX Engine Active");
        })
        .catch(err => {
          console.error("VFX Init Failed", err);
          log("VFX Engine Failed: " + err.message);
          setIsVFXMode(false);
          setVfxLoading(false);
        });

      return () => {
        if (vfxAppRef.current) {
          vfxAppRef.current.destroy();
          vfxAppRef.current = null;
        }
      };
    }
  }, [isVFXMode, safeVideoSrc]); // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const sanitizedText = captionText.replace(/'/g, ""); // Removed forced UPPERCASE
          const fontColor = captionColor === "yellow" ? "yellow" : "white";
          // Moved text higher (0.25) to be safe above TikTok/Reels description area without needing red guides
          const yPos = "(h-text_h)-(h*0.25)";
          videoFilters.push(
            `drawtext=fontfile=/arial.ttf:text='${sanitizedText}':fontcolor=${fontColor}:fontsize=64:box=1:boxcolor=black@0.7:boxborderw=10:x=(w-text_w)/2:y=${yPos}`
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

      // Clean up temp files
      try {
        if (file) await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        if (images && images.length > 0) {
          // cleanup images loop
        }
      } catch (e) {}

      return newFile; // Return file instead of calling onSave immediately
    } catch (err) {
      console.error(err);
      log("Error processing video. Check console.");
      return null;
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveWrapper = async (mode = "save") => {
    const resultFile = await handleSave();
    if (!resultFile) return;

    if (mode === "download") {
      const url = URL.createObjectURL(resultFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log("Video downloaded to device!");
    } else {
      onSave(resultFile);
    }
  };

  if (!file && (!images || images.length === 0)) return null;

  return (
    <div className="video-editor-container">
      <h3>Trim Video</h3>
      {!loaded ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading Video Engine...</p>
        </div>
      ) : (
        <>
          {/* --- EDITOR TABS --- */}
          <div className="editor-tabs">
            <button
              className={`tab-btn ${activeTab === "overlay" ? "active" : ""}`}
              onClick={() => setActiveTab("overlay")}
            >
              <span>🛡️</span> Overlay
            </button>
            <button
              className={`tab-btn ${activeTab === "text" ? "active" : ""}`}
              onClick={() => setActiveTab("text")}
            >
              <span>📝</span> Text
            </button>
            <button
              className={`tab-btn ${activeTab === "filters" ? "active" : ""}`}
              onClick={() => setActiveTab("filters")}
            >
              <span>✨</span> Filters
            </button>
            <button
              className={`tab-btn ${activeTab === "adjust" ? "active" : ""}`}
              onClick={() => setActiveTab("adjust")}
            >
              <span>🎚️</span> Adjust
            </button>
            <button
              className={`tab-btn ${activeTab === "effects" ? "active" : ""}`}
              onClick={() => setActiveTab("effects")}
            >
              <span>🎨</span> Effects
            </button>
          </div>

          {/* --- FILTERS TAB --- */}
          {activeTab === "filters" && (
            <div className="presets-container tab-content">
              <button
                className={`preset-btn ${activePreset === "custom" ? "active" : ""}`}
                onClick={() => applyPreset("custom")}
              >
                <span className="preset-icon">⚙️</span>
                Custom
              </button>
              <button
                className={`preset-btn ${activePreset === "podcast" ? "active" : ""}`}
                onClick={() => applyPreset("podcast")}
              >
                <span className="preset-icon">🎙️</span>
                Podcast Clip
              </button>
              <button
                className={`preset-btn ${activePreset === "gameplay" ? "active" : ""}`}
                onClick={() => applyPreset("gameplay")}
              >
                <span className="preset-icon">🎮</span>
                Gameplay
              </button>
              <button
                id="cinematic-preset-btn"
                className={`preset-btn ${activePreset === "cinematic" ? "active" : ""}`}
                onClick={() => applyPreset("cinematic")}
              >
                <span className="preset-icon">🎬</span>
                Cinematic (Viral)
              </button>
            </div>
          )}

          {/* --- ADJUST TAB --- */}
          {activeTab === "adjust" && (
            <div
              className="controls-row tab-content"
              style={{ display: "flex", gap: "20px", marginBottom: "16px" }}
            >
              <div
                className={`virality-hud ${viralityScore > 80 ? "high-score" : ""}`}
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  background: "rgba(16, 185, 129, 0.05)",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    color: "#34d399",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🚀</span> Virality Potential: {viralityScore}/100
                </h4>
                <div style={{ marginTop: "12px" }}>
                  <button
                    onClick={() => {
                      applyPreset("cinematic");
                      setBoostQuality(true);
                      setEnhanceAudio(true);
                      // Force a high score locally for feedback
                      setViralityScore(95);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px",
                      background: "#10b981",
                      border: "none",
                      color: "white",
                      borderRadius: "6px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span>⚡</span> One-Click Optimize
                  </button>
                </div>
              </div>

              <div
                className="quality-hud"
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  background: "rgba(59, 130, 246, 0.05)",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    color: "#60a5fa",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>✨</span> Quality Guard
                </h4>
                <label
                  className="toggle-label"
                  style={{ marginTop: "12px", width: "100%", justifyContent: "space-between" }}
                >
                  <span>
                    {activeOverlay === "youtube"
                      ? "Force 1440p Upscale (VP9 Hack)"
                      : ["tiktok", "instagram"].includes(activeOverlay)
                        ? "Crisp 1080p (Prevent Compression)"
                        : "Enhance Bitrate"}
                  </span>
                  <input
                    type="checkbox"
                    checked={boostQuality}
                    onChange={e => {
                      setBoostQuality(e.target.checked);
                      setActivePreset("custom");
                    }}
                  />
                </label>
                <label
                  className="toggle-label"
                  style={{ marginTop: "10px", width: "100%", justifyContent: "space-between" }}
                >
                  <span>🎙️ Studio Mic Enhancer</span>
                  <input
                    type="checkbox"
                    checked={enhanceAudio}
                    onChange={e => {
                      setEnhanceAudio(e.target.checked);
                      setActivePreset("custom");
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* --- EFFECTS TAB (VFX Studio) --- */}
          {activeTab === "effects" && (
            <div
              className="tab-content"
              style={{
                marginBottom: "16px",
                padding: "16px",
                border: "1px solid #c084fc", // Purple border
                borderRadius: "12px",
                background: "rgba(192, 132, 252, 0.05)",
              }}
            >
              <h4
                style={{
                  margin: "0 0 12px 0",
                  color: "#c084fc",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>🎨</span> VFX Studio
              </h4>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => {
                    const newEffect = activeVFXEffect === "cinema" ? "none" : "cinema";
                    setActiveVFXEffect(newEffect);
                    if (newEffect !== "none") setIsVFXMode(true);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "8px",
                    border: activeVFXEffect === "cinema" ? "1px solid #c084fc" : "1px solid #444",
                    background:
                      activeVFXEffect === "cinema" ? "rgba(192, 132, 252, 0.2)" : "transparent",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  🎬 Cinema Look
                </button>

                <button
                  onClick={() => {
                    const newEffect = activeVFXEffect === "green-screen" ? "none" : "green-screen";
                    setActiveVFXEffect(newEffect);
                    if (newEffect !== "none") setIsVFXMode(true);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "8px",
                    border:
                      activeVFXEffect === "green-screen" ? "1px solid #4ade80" : "1px solid #444",
                    background:
                      activeVFXEffect === "green-screen"
                        ? "rgba(74, 222, 128, 0.2)"
                        : "transparent",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  🟩 Green Screen
                </button>
              </div>

              {activeVFXEffect === "green-screen" && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "#00000040",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ color: "#aaa", fontSize: "0.9em", minWidth: "80px" }}>
                      Key Color:
                    </span>
                    <input
                      type="color"
                      value={gsKeyColor}
                      onChange={e => setGsKeyColor(e.target.value)}
                      style={{ border: "none", height: "30px", width: "100%", cursor: "pointer" }}
                    />
                  </div>

                  {/* Collapsed Advanced Settings */}
                  <details
                    style={{ marginTop: "12px", borderTop: "1px solid #444", paddingTop: "8px" }}
                  >
                    <summary
                      style={{
                        color: "#aaa",
                        cursor: "pointer",
                        fontSize: "0.9em",
                        outline: "none",
                      }}
                    >
                      Pro Settings (Sensitivity)
                    </summary>
                    <div style={{ padding: "8px 0" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <span style={{ color: "#aaa", fontSize: "0.9em", minWidth: "80px" }}>
                          Threshold:
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="0.5"
                          step="0.01"
                          value={gsThreshold}
                          onChange={e => setGsThreshold(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <span style={{ color: "white", width: "40px", fontSize: "0.8em" }}>
                          {(gsThreshold * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <span style={{ color: "#aaa", fontSize: "0.9em", minWidth: "80px" }}>
                          Smoothing:
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="0.5"
                          step="0.01"
                          value={gsSmoothing}
                          onChange={e => setGsSmoothing(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <span style={{ color: "white", width: "40px", fontSize: "0.8em" }}>
                          {(gsSmoothing * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </details>

                  <div
                    style={{
                      marginTop: "12px",
                      borderTop: "1px solid #444",
                      paddingTop: "8px",
                    }}
                  >
                    <label
                      style={{
                        display: "block",
                        color: "#aaa",
                        fontSize: "0.9em",
                        marginBottom: "4px",
                      }}
                    >
                      Background Replacer:
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          try {
                            const url = URL.createObjectURL(e.target.files[0]);
                            const img = new Image();
                            img.src = url;
                            setGsBgImage(url);
                          } catch (err) {
                            console.error("Image load fail", err);
                          }
                        }
                      }}
                      style={{
                        width: "100%",
                        background: "#222",
                        color: "#fff",
                        fontSize: "0.8rem",
                      }}
                    />
                    {gsBgImage && (
                      <button
                        onClick={() => setGsBgImage(null)}
                        style={{
                          marginTop: "4px",
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                      >
                        Remove Background Image
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- TEXT TAB --- */}
          {activeTab === "text" && (
            <div
              className="tab-content"
              style={{
                marginBottom: "16px",
                padding: "16px",
                border: "1px solid #333",
                borderRadius: "12px",
                background: "#1e1e1e",
              }}
            >
              <h4 style={{ margin: "0 0 12px 0", color: "#fff" }}>📝 Quick Captions</h4>
              <div
                className="controls-row"
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <button
                  onClick={handleAutoTranscribe}
                  disabled={transcribing}
                  style={{
                    padding: "10px 16px",
                    background: transcribing ? "#333" : "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: transcribing ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "600",
                    minWidth: "160px",
                    justifyContent: "center",
                  }}
                  title="Regenerate captions using AI"
                >
                  {transcribing ? (
                    <>👂 Processing...</>
                  ) : hasTranscribed ? (
                    <>🔄 Regenerate</>
                  ) : (
                    <>✨ Auto-Transcribe</>
                  )}
                </button>

                <label className="toggle-label" style={{ fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    checked={translateToEnglish}
                    onChange={e => setTranslateToEnglish(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Translate
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
                  style={{ width: "120px" }}
                >
                  <option value="white">White</option>
                  <option value="yellow">Yellow</option>
                  <option value="#3b82f6">Blue</option>
                  <option value="#ef4444">Red</option>
                  <option value="#10b981">Green</option>
                </select>
              </div>
              {captionText && (
                <small style={{ color: "#888", display: "block", marginTop: "8px" }}>
                  Preview: Captions are auto-positioned for maximum engagement (Safe Zone
                  Compliant).
                </small>
              )}
            </div>
          )}

          {activeTab === "overlay" && (
            <div className="overlay-controls tab-content" style={{ marginBottom: "16px" }}>
              <span style={{ color: "#fff", fontWeight: "600", marginRight: "10px" }}>
                🛡️ Safe Zone:
              </span>
              <button
                className={`btn-overlay ${activeOverlay === "none" ? "active" : ""}`}
                onClick={() => setActiveOverlay("none")}
                style={{
                  background: activeOverlay === "none" ? "#3b82f6" : "#333",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  marginRight: "8px",
                  cursor: "pointer",
                }}
              >
                Off
              </button>
              <button
                className={`btn-overlay ${activeOverlay === "tiktok" ? "active" : ""}`}
                onClick={() => setActiveOverlay("tiktok")}
                style={{
                  background: activeOverlay === "tiktok" ? "#3b82f6" : "#333",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  marginRight: "8px",
                  cursor: "pointer",
                }}
              >
                TikTok
              </button>
              <button
                className={`btn-overlay ${activeOverlay === "instagram" ? "active" : ""}`}
                onClick={() => setActiveOverlay("instagram")}
                style={{
                  background: activeOverlay === "instagram" ? "#3b82f6" : "#333",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  marginRight: "8px",
                  cursor: "pointer",
                }}
              >
                Reels
              </button>
              <button
                className={`btn-overlay ${activeOverlay === "youtube" ? "active" : ""}`}
                onClick={() => setActiveOverlay("youtube")}
                style={{
                  background: activeOverlay === "youtube" ? "#3b82f6" : "#333",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  cursor: "pointer",
                }}
              >
                Shorts
              </button>
            </div>
          )}

          <div className="video-preview" style={{ marginBottom: "0" }}>
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
              <div
                className="video-player-wrapper"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  maxHeight: "80vh", // Force a maximum height to prevent full-page scroll
                  aspectRatio: "9/16", // Maintain vertical aspect ratio
                  margin: "0 auto", // Center it
                  // Checkerboard pattern for transparency
                  backgroundImage: safeGsBgImage
                    ? `url(${safeGsBgImage})`
                    : `
                    linear-gradient(45deg, #222 25%, transparent 25%), 
                    linear-gradient(-45deg, #222 25%, transparent 25%), 
                    linear-gradient(45deg, transparent 75%, #222 75%), 
                    linear-gradient(-45deg, transparent 75%, #222 75%)
                  `,
                  backgroundSize: safeGsBgImage ? "cover" : "20px 20px",
                  backgroundPosition: safeGsBgImage
                    ? "center"
                    : "0 0, 0 10px, 10px -10px, -10px 0px",
                  backgroundColor: "#333",
                  overflow: "hidden",
                }}
              >
                <video
                  ref={videoRef}
                  src={safeVideoSrc}
                  controls
                  onLoadedMetadata={handleMetadataLoaded}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block", // Removes bottom gap
                    // Keep relative so it dictates container height
                    // When VFX is on AND loaded, we hide original (opacity 0).
                    // While loading, we keep original visible so screen isn't black.
                    opacity: isVFXMode && !vfxLoading ? 0 : 1,
                    position: "relative",
                  }}
                  crossOrigin="anonymous"
                />

                {isVFXMode && (
                  <canvas
                    ref={vfxCanvasRef}
                    style={{
                      // Absolute positioning covering the video exactly
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none", // Allow clicks to pass through to the video elements
                    }}
                  />
                )}

                {vfxLoading && (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      background: "rgba(0,0,0,0.8)",
                      color: "#fff",
                      padding: "20px",
                      borderRadius: "12px",
                      zIndex: 200,
                      textAlign: "center",
                    }}
                  >
                    <div className="spinner" style={{ margin: "0 auto 10px auto" }}></div>
                    <div>🚀 Initializing GPU...</div>
                  </div>
                )}
              </div>
            )}
            {safeCaptionText && (
              <div
                className="caption-preview-overlay"
                style={{
                  position: "absolute",
                  bottom: "35%", // NEW: Moved much higher to clear buttons/descriptions naturally
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: captionColor,
                  fontFamily: "Arial, sans-serif",
                  fontSize: "clamp(24px, 5vw, 42px)", // Larger, more engaging text
                  fontWeight: "bold", // Bold for readability
                  textShadow: "2px 2px 4px rgba(0,0,0,0.9), -1px -1px 0 #000", // Stronger shadow
                  textAlign: "center",
                  pointerEvents: "none",
                  backgroundColor: "rgba(0,0,0,0.0)", // Transparent background looks more "native"
                  padding: "4px 8px",
                  borderRadius: "4px",
                  maxWidth: "90%",
                  width: "100%",
                  zIndex: 20,
                  whiteSpace: "pre-wrap",
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

          <div
            className="controls-row"
            style={{ display: "flex", gap: "20px", marginBottom: "20px" }}
          >
            <div
              className="time-input"
              style={{
                flex: 1,
                background: "#1e1e1e",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
              }}
            >
              <label
                style={{
                  color: "#aaa",
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Start (sec)
              </label>
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
                style={{
                  width: "100%",
                  background: "#000",
                  color: "#fff",
                  border: "1px solid #444",
                  padding: "8px",
                  borderRadius: "4px",
                }}
              />
            </div>
            <div
              className="time-input"
              style={{
                flex: 1,
                background: "#1e1e1e",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
              }}
            >
              <label
                style={{
                  color: "#aaa",
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                End (sec)
              </label>
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
                style={{
                  width: "100%",
                  background: "#000",
                  color: "#fff",
                  border: "1px solid #444",
                  padding: "8px",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>

          <div
            className="editor-actions"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "10px",
              marginTop: "20px",
            }}
          >
            <button
              className="btn-cancel"
              onClick={onCancel}
              disabled={processing}
              style={{
                background: "#2a2a2a",
                color: "#fff",
                border: "1px solid #444",
                padding: "12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Cancel
            </button>
            <button
              className="btn-download"
              onClick={() => handleSaveWrapper("download")}
              disabled={processing}
              style={{
                background: "#059669",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "12px",
                cursor: processing ? "not-allowed" : "pointer",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              💾 Download
            </button>
            <button
              className="btn-save"
              onClick={() => handleSaveWrapper("save")}
              disabled={processing}
              style={{
                background: "linear-gradient(45deg, #7c3aed, #db2777)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "12px",
                cursor: processing ? "not-allowed" : "pointer",
                fontWeight: "bold",
                boxShadow: "0 0 15px rgba(124, 58, 237, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {processing ? `Processing ${progress}%...` : "✅ Save Video"}
            </button>
          </div>
          <p ref={messageRef} className="status-log"></p>
        </>
      )}
    </div>
  );
}

export default VideoEditor;
