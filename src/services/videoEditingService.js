// videoEditingService.js
// Service for Single Video Editing (Smart Crop, Silence Removal)
// Bridges Node.js backend with Python Media Worker

const axios = require("axios");
const admin = require("firebase-admin");
const db = admin.firestore();
const fs = require("fs");
const { queueAudioExtractionTask } = require("./mediaWorkerTaskQueue");

// Point to the Python service (default to Cloud Run in production, localhost in dev)
// Use the deployed URL for stability if env var is missing
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-jddzncgt2a-uc.a.run.app";

const { v4: uuidv4 } = require("uuid");

class VideoEditingService {
  async startAudioExtractionJob(videoUrl, userId, options = {}) {
    const jobId = uuidv4();
    console.log(`[VideoEditing] Starting audio extraction job ${jobId} for User ${userId}`);

    try {
      await db
        .collection("video_edits")
        .doc(jobId)
        .set({
          jobId,
          type: "audio_extraction",
          userId,
          videoUrl,
          sourceLabel: options.sourceLabel || "",
          source: {
            kind: "audio_donor_video",
            url: videoUrl,
            label: options.sourceLabel || "",
          },
          status: "queued",
          stage: "queued_for_dispatch",
          progress: 0,
          result: null,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        });

      const workerResult = await queueAudioExtractionTask({
        jobId,
        videoUrl,
        outputFormat: "mp3",
      });
      await db
        .collection("video_edits")
        .doc(jobId)
        .set(
          {
            status: "queued",
            stage: "queued_for_worker",
            progress: 5,
            dispatchMode: workerResult.dispatchMode,
            taskName: workerResult.taskName || null,
            taskTargetUrl: workerResult.taskTargetUrl,
            workerJobId: workerResult.workerJobId || jobId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      return { jobId };
    } catch (error) {
      console.error(`[VideoEditing] Failed to start audio extraction job ${jobId}:`, error.message);

      await db.collection("video_edits").doc(jobId).set(
        {
          status: "failed",
          error: error.message,
          progress: 0,
          failedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      throw new Error("Failed to queue audio extraction job");
    }
  }

  /**
   * Start an async video processing job
   * Returns a jobId immediately for polling.
   */
  async startProcessingJob(videoUrl, options, userId) {
    const jobId = uuidv4();
    console.log(`[VideoEditing] Starting Async Job ${jobId} for User ${userId}`);

    try {
      await db.collection("video_edits").doc(jobId).set({
        jobId,
        userId,
        videoUrl,
        options,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      // Start background processing without awaiting
      this.processJobBackground(jobId, videoUrl, options, userId).catch(err => {
        console.error(`[VideoEditing] Background Job ${jobId} Failed (uncaught):`, err);
      });

      return { jobId };
    } catch (error) {
      console.error("Failed to start job:", error);
      throw new Error("Failed to queue video processing job");
    }
  }

  /**
   * Background processor that wraps processVideo
   */
  async processJobBackground(jobId, videoUrl, options, userId) {
    const docRef = db.collection("video_edits").doc(jobId);

    try {
      await docRef.update({
        status: "processing",
        progress: 10,
        updatedAt: new Date().toISOString(),
      });

      // Call the existing synchronous logic
      // Note: processVideo handles the Python communication, storage upload, etc.
      // We pass jobId to enable async handoff
      const result = await this.processVideo(videoUrl, options, userId, jobId);

      // If async mode was triggered, the python worker took over responsibilities.
      // We don't mark as completed here. Python will do it.
      if (result.status === "processing" && result.mode === "async") {
        console.log(`[VideoEditing] Job ${jobId} handed off to Async Worker.`);
        // Optionally update status to indicate remote processing
        await docRef.update({
          status: "processing_remote",
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      await docRef.update({
        status: "completed",
        progress: 100,
        result: result, // { success: true, url: ..., remainingCredits: ... }
        outputUrl: result.url,
        completedAt: new Date().toISOString(),
      });

      console.log(`[VideoEditing] Job ${jobId} Completed Successfully.`);
    } catch (error) {
      console.error(`[VideoEditing] Job ${jobId} Failed:`, error.message);
      await docRef.update({
        status: "failed",
        error: error.message,
        progress: 0,
        failedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Process a video with AI options (Smart Crop, Silence Removal)
   * @param {string} videoUrl - Source video URL
   * @param {Object} options - { smartCrop: boolean, silenceRemoval: boolean }
   * @param {string} userId - User ID requesting the edit
   * @param {string} jobId - (Optional) Job ID for async tracking
   * @returns {Promise<Object>} { success: true, url: string, ... }
   */
  async processVideo(videoUrl, options, userId, jobId = null) {
    // Safe logging - pass user input as data arg, not template string
    console.log("[VideoEditing] Processing video request", { userId, options, jobId });
    console.log("[VideoEditing] Options detail:", JSON.stringify(options, null, 2));

    // Track the resulting file path from Python
    let resultPath = null;
    let operation = "";

    try {
      // 1. Determine which operation to run
      // NEW: Use the Pipeline Endpoint for everything except Analysis/Render
      // This supports Multi-AI features (Crop + Music + Captions) in one pass!
      let endpoint = "/process-video";
      let operation = "ai_process";
      let isPipeline = true;

      // Special cases that use dedicated endpoints (Phase 2 analysis)
      if (options.analyzeClips) {
        endpoint = "/analyze-clips"; // Note: Endpoint names must match exactly
        operation = "analyze_clips";
        isPipeline = false;
      } else if (options.renderViral) {
        endpoint = "/render-viral-clip";
        operation = "render_viral_clip";
        isPipeline = false;
      }

      // If none of the pipeline flags are set, maybe we shouldn't act?
      // But the frontend usually sends at least one.

      /* --- MOCK REMOVED FOR PRODUCTION ---
      // --- MOCK RESPONSE FOR CLIP ANALYSIS (Allows UI Testing without Python Worker) ---
      if (options.analyzeClips) {
          console.log("[VideoEditing] Mocking Viral Clip Analysis...");
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          return {
              success: true,
              clipSuggestions: [
                  { id: 1, start: 0, end: 5, duration: 5, reason: "High energy intro detected! 🚀" },
                  { id: 2, start: 10, end: 18, duration: 8, reason: "Laughter and engagement spike 😂" },
                  { id: 3, start: 45, end: 55, duration: 10, reason: "Strong visual movement 🎥" }
              ],
              message: "Analysis completed (Mock)"
          };
      }
      */
      // --- END MOCK ---

      // 2. Call Python Worker
      // Pass cropStyle if available (defaults to 'blur' if undefined but beneficial to pass explicitly)
      let cropStyle = "blur";
      // FORCE CHECK: Ensure cropStyle is correctly extracted from options
      if (options.cropStyle && String(options.cropStyle).toLowerCase().includes("zoom")) {
        cropStyle = "zoom";
      }

      console.log(`[VideoEditing] Sending processing request. Pipeline Mode: ${isPipeline}`);

      // Build Payload (Unified)
      let payload = {
        video_url: videoUrl, // The URL (or local path if running locally)
        target_aspect_ratio: "9:16",

        // Context
        job_id: jobId,
        async_mode: !!jobId, // Enable async if JobId provided

        // Pipeline Flags
        smart_crop: options.smartCrop || false,
        quality_enhancement: options.enhanceQuality || false,
        quality_enhancement_profile: options.qualityEnhancementProfile || "safe_clean",
        crop_style: cropStyle,
        silence_removal: options.silenceRemoval || false,
        silence_threshold_db: Number(options.silenceThreshold ?? -35),
        min_silence_duration: Number(options.minSilenceDuration ?? 0.75),
        captions: options.captions || false,
        remove_watermark: options.removeWatermark || false,
        watermark_mode: options.watermarkMode || "adaptive",
        watermark_regions: Array.isArray(options.manualWatermarkRegions)
          ? options.manualWatermarkRegions
          : [],
        add_music: options.addMusic || false,
        music_file: options.musicFile || "upbeat.mp3", // Changed default to upbeat.mp3
        mute_audio: options.muteAudio || false,
        music_ducking: options.musicDucking !== undefined ? options.musicDucking : true,
        music_ducking_strength: Number(options.musicDuckingStrength ?? 0.35),
        volume: Number(options.musicVolume ?? 0.15),
        is_search: options.isSearch || false,
        safe_search: options.safeSearch !== undefined ? options.safeSearch : true,

        // Viral Hook Feature
        add_hook: options.addHook || false,
        hook_text: options.hookText || "WAIT TILL THE END 🚨",
        hook_intro_seconds: Number(options.hookIntroSeconds || 3.4),
        hook_template: options.hookTemplate || "blur_reveal",
        hook_start_time: Number(options.hookStartTime || 0),
        hook_blur_background:
          options.hookBlurBackground !== undefined ? !!options.hookBlurBackground : true,
        hook_dark_overlay: options.hookDarkOverlay !== undefined ? !!options.hookDarkOverlay : true,
        hook_freeze_frame: !!options.hookFreezeFrame,
        hook_zoom_scale: Number(options.hookZoomScale || 1.08),
        hook_text_animation: options.hookTextAnimation || "slide_up",
        transcription_language: options.transcriptionLanguage || "auto",
        transcription_hint:
          options.transcriptionHint ||
          "South African English accent possible. Preserve local names, slang, and code-switching.",
      };

      // If rendering a Viral Clip, attach specific data
      if (options.renderViral && options.viralData) {
        const viralData = options.viralData;
        const timelineSegments = Array.isArray(viralData.timeline_segments)
          ? viralData.timeline_segments
          : [];
        const timelineDuration = timelineSegments.reduce(
          (sum, segment) => sum + Math.max(0, Number(segment.duration || 0)),
          0
        );
        const startTime = Number(viralData.start_time ?? viralData.clipTime?.start ?? 0);
        const endTime = Number(
          viralData.end_time ??
            viralData.clipTime?.end ??
            (timelineDuration > 0 ? timelineDuration : startTime)
        );
        endpoint = "/render-viral-clip";
        payload = {
          ...payload,
          start_time: startTime,
          end_time: endTime,
          auto_captions:
            viralData.auto_captions !== undefined ? !!viralData.auto_captions : options.captions,
          timeline_segments: timelineSegments,
          background_audio: viralData.background_audio || null,
          overlays: (viralData.overlays || []).map(o => ({
            ...o,
            start_time:
              o.start_time !== undefined && o.start_time !== null ? o.start_time : o.startTime,
            duration:
              o.duration !== undefined && o.duration !== null ? Number(o.duration) : o.duration,
            width: o.width !== undefined && o.width !== null ? Number(o.width) : o.width,
            height: o.height !== undefined && o.height !== null ? Number(o.height) : o.height,
          })),
        };
      }

      console.log("[VideoEditing] Payload to worker:", JSON.stringify(payload));

      // Increase timeout significantly for AI model downloading (30 mins)
      const response = await axios.post(`${MEDIA_WORKER_URL}${endpoint}`, payload, {
        timeout: 1800000, // 30 minutes (increased from 10m for model downloads)
      });

      const result = response.data;

      // CHECK FOR ASYNC MODE RESPONSE
      if (result.status === "processing" && result.mode === "async") {
        return { status: "processing", mode: "async", jobId: result.job_id };
      }

      // Special handling for Analyze Clips (No output file, just JSON)
      if (operation === "analyze_clips") {
        return {
          success: true,
          clipSuggestions: result.clipSuggestions || result.scenes,
          message: "Analysis completed",
        };
      }

      // Check if the worker already uploaded the file (Distributed Worker Support)
      if (result.output_url && result.output_url.startsWith("http")) {
        console.log(`[VideoEditing] Worker returned remote URL: ${result.output_url}`);
        return {
          success: true,
          url: result.output_url,
          duration: result.duration || 0,
          message: "Processing completed (Remote Worker)",
        };
      }

      resultPath = result.output_path; // Local path from shared volume

      if (!resultPath || !fs.existsSync(resultPath)) {
        throw new Error("Worker failed to return a valid file path or URL");
      }

      // 3. Upload to Firebase Storage (Local Worker Case)
      const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        (process.env.FIREBASE_PROJECT_ID
          ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
          : undefined);
      if (!bucketName) {
        throw new Error(
          "Bucket name not specified or invalid. Check FIREBASE_STORAGE_BUCKET or FIREBASE_PROJECT_ID env vars."
        );
      }

      const bucket = admin.storage().bucket(bucketName);
      const filename = `${operation}_${Date.now()}.mp4`;
      const destination = `edited_videos/${userId}/${filename}`;

      await bucket.upload(resultPath, {
        destination: destination,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            originalUrl: videoUrl,
            operation: operation,
          },
        },
      });

      // 4. Get Public URL
      const fileRef = bucket.file(destination);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

      // 5. Cleanup Local File
      try {
        fs.unlinkSync(resultPath);
      } catch (e) {
        console.warn("[VideoEditing] Failed to delete temp file:", e.message);
      }

      // 6. Cleanup Source File (If it was a temporary upload)
      // We check if the videoUrl is a storage location we own (e.g., contains 'temp_uploads')
      if (videoUrl.includes("temp_uploads") || videoUrl.includes("firebase")) {
        try {
          // Extract path from URL or pass as metadata.
          // For safety in Phase 1, we won't auto-delete to avoid deleting user library items accidentally.
          // But we will Log it for a Lifecycle Policy to handle.
          // BETTER APPROACH: Return the 'temp' flag to the controller/frontend to trigger deletion?
          // OR: Just rely on Lifecycle Rules (Safest).
          console.log("[VideoEditing] Note: Source file may need cleanup:", videoUrl);
        } catch (e) {
          console.warn("Cleanup source failed", e);
        }
      }

      // 7. Log to Firestore (Optional, but good for history)
      await db.collection("edit_history").add({
        userId,
        originalUrl: videoUrl,
        processedUrl: publicUrl,
        options,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        url: publicUrl,
        message: "Video processed successfully",
      };
    } catch (error) {
      console.error("[VideoEditing] Error:", error.message);
      let errorDetail = error.message;
      if (error.response && error.response.data) {
        console.error("Worker Error:", error.response.data);
        // If the worker returned a 'detail' field (FastAPI default), include it.
        if (error.response.data.detail) {
          errorDetail += ` - Worker says: ${error.response.data.detail}`;
        } else {
          errorDetail += ` - Worker says: ${JSON.stringify(error.response.data)}`;
        }
      }
      throw new Error(`Video processing failed: ${errorDetail}`);
    }
  }

  /**
   * Analyze a video to find potential viral clips (Phase 2)
   * @param {string} videoUrl
   * @param {string} userId
   * @returns {Promise<Array>} List of scene objects {start, end, viralScore}
   */
  async analyzeVideo(videoUrl, userId) {
    console.log(`[VideoAnalysis] Analyzing for User: ${userId}`);
    try {
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/analyze-clips`,
        {
          video_url: videoUrl,
          target_aspect_ratio: "9:16",
        },
        { timeout: 600000 }
      ); // 10 minutes for analysis

      // Returns { status, job_id, scenes: [...] }
      return response.data.scenes || [];
    } catch (error) {
      console.error("[VideoAnalysis] Error:", error.message);
      throw new Error("Video analysis failed");
    }
  }

  /**
   * Render a specific clip from a larger video
   */
  async renderClip(videoUrl, startTime, endTime, userId) {
    console.log(`[VideoRender] Rendering clip for User: ${userId} (${startTime}-${endTime}s)`);
    try {
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/render-clip`,
        {
          video_url: videoUrl,
          start_time: startTime,
          end_time: endTime,
          target_aspect_ratio: "9:16",
        },
        { timeout: 300000 }
      );

      const resultPath = response.data.output_path;

      // Upload to Firebase
      const bucket = admin.storage().bucket();
      const filename = `clip_${Date.now()}.mp4`;
      const destination = `viral_clips/${userId}/${filename}`;

      await bucket.upload(resultPath, {
        destination: destination,
        metadata: { contentType: "video/mp4" },
      });

      const fileRef = bucket.file(destination);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

      // Cleanup local
      try {
        fs.unlinkSync(resultPath);
      } catch (e) {}

      return { url: publicUrl };
    } catch (error) {
      console.error("[VideoRender] Error:", error.message);
      throw new Error("Clip rendering failed");
    }
  }

  /**
   * Transcribe video audio to text using Whisper (via Python Worker)
   * @param {string} videoUrl
   * @returns {Promise<Array>} List of segments {start, end, text}
   */
  /**
   * Start an async transcription job
   */
  async startTranscriptionJob(videoUrl, userId) {
    const jobId = uuidv4();
    try {
      // Store initial job state
      await db.collection("video_edits").doc(jobId).set({
        jobId,
        type: "transcription",
        userId,
        videoUrl,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      // Start background task
      this.processTranscriptionBackground(jobId, videoUrl).catch(err => {
        console.error(`[VideoTranscribe] Background Job ${jobId} Failed:`, err);
      });

      return { jobId };
    } catch (e) {
      throw new Error("Failed to start transcription job");
    }
  }

  /**
   * Background processor for transcription
   */
  async processTranscriptionBackground(jobId, videoUrl) {
    const docRef = db.collection("video_edits").doc(jobId);
    try {
      await docRef.update({ status: "processing", progress: 10 });

      console.log(`[VideoTranscribe] Calling worker for job ${jobId}`);

      // Call Python Worker
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/transcribe`,
        {
          video_url: videoUrl,
          language: "auto",
          hint: "South African English accent possible. Preserve local names, slang, and code-switching.",
        },
        {
          timeout: 600000, // 10 minutes
        }
      );

      // Worker returns { segments: [...] }
      const result = response.data;

      await docRef.update({
        status: "completed",
        result: { segments: result.segments },
        progress: 100,
        completedAt: new Date().toISOString(),
      });

      console.log(`[VideoTranscribe] Job ${jobId} Completed.`);
    } catch (error) {
      console.error(`[VideoTranscribe] Job ${jobId} Failed:`, error.message);
      await docRef.update({
        status: "failed",
        error: error.message,
        progress: 0,
        failedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Transcribe audio from video (Sync - Deprecated for large files)
   * @param {string} videoUrl
   * @returns {Promise<Array>} segments
   */
  async transcribeVideo(videoUrl) {
    console.log(`[VideoTranscription] Requesting transcription for: ${videoUrl}`);
    try {
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/transcribe`,
        {
          video_url: videoUrl,
        },
        { timeout: 600000 }
      ); // 10 mins

      // Returns { status, segments: [...] }
      return response.data.segments || [];
    } catch (error) {
      console.error("[VideoTranscription] Error:", error.message);
      // Fallback or rethrow
      throw new Error("Transcription failed");
    }
  }
}

// Export the class AND a default instance
module.exports = VideoEditingService;
