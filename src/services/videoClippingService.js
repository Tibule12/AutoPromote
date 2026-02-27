// videoClippingService.js
// AI-powered video clipping service (Opus Clip style)
// REPLACED for Phase 1: Delegates heavy processing to Python Media Worker

const axios = require("axios");
const admin = require("firebase-admin"); // Direct admin for db/storage

// Lazy initialize db/storage to avoid load-time crashes if admin not initialized yet
let db, bucket;
function getDb() {
  if (!db) db = admin.firestore();
  return db;
}
function getStorage() {
  // Explicitly use the bucket name from env or fallback to known default to prevent "Bucket name not specified" error
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "autopromote-cc6d3.firebasestorage.app";
  if (!bucket) bucket = admin.storage().bucket(bucketName);
  return bucket;
}

const crypto = require("crypto");

// Point to the Python service (default localhost:8000)
const MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL || "http://localhost:8000";

class VideoClippingService {
  /**
   * Start async analysis job
   * @param {string} videoUrl
   * @param {string} contentId
   * @param {string} userId
   * @returns {Promise<string>} jobId
   */
  async startAnalysis(videoUrl, contentId, userId) {
    const jobId = crypto.randomBytes(16).toString("hex");
    const db = getDb();

    // Create initial job record
    await db.collection("clip_analyses").doc(jobId).set({
      userId,
      contentId,
      videoUrl,
      status: "queued",
      createdAt: new Date().toISOString(),
      progress: 0,
      message: "Job queued...",
    });

    // Trigger background processing (Fire & Forget)
    // We don't await this, allowing the API request to return immediately
    this.processAnalysisBackground(jobId, videoUrl, contentId, userId).catch(err => {
      console.error(`[VideoClipping] Background Job ${jobId} Failed:`, err);
      getDb()
        .collection("clip_analyses")
        .doc(jobId)
        .update({
          status: "failed",
          error: err.message,
          progress: 100,
        })
        .catch(e => console.error("Failed to update failure status:", e));
    });

    return jobId;
  }

  /**
   * Background processor for analysis
   */
  async processAnalysisBackground(jobId, videoUrl, contentId, userId) {
    console.log(`[VideoClipping] Starting Analysis Job ${jobId}`);
    const db = getDb();

    try {
      await db.collection("clip_analyses").doc(jobId).update({
        status: "processing",
        message: "Analyzing video structure...",
        progress: 10,
      });

      // Check worker health
      try {
        // Quick check if worker is alive
        await axios.get(`${MEDIA_WORKER_URL}/status`, { timeout: 2000 });
      } catch (e) {
        console.warn("Worker might be sleeping, waking up...");
      }

      // Call Python Worker
      // This can take 10+ minutes
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/analyze-clips`,
        {
          video_url: videoUrl,
          target_aspect_ratio: "9:16",
        },
        {
          timeout: 900000, // 15 min timeout (Node side)
        }
      );

      const result = response.data;

      // Format Results
      const rawSuggestions = result.clipSuggestions || result.scenes || [];
      const formattedSuggestions = rawSuggestions.map((s, index) => ({
        id: s.id || `clip_${index}_${crypto.randomBytes(4).toString("hex")}`,
        start: s.start,
        end: s.end,
        duration: s.end - s.start,
        viralScore: s.viralScore || 60,
        text: s.text || `Segment ${index + 1}`,
        status: "suggested",
      }));

      // Update Job as Completed
      await db.collection("clip_analyses").doc(jobId).update({
        status: "completed",
        progress: 100,
        message: "Analysis complete",
        clipSuggestions: formattedSuggestions,
        scenesDetected: formattedSuggestions.length,
        completedAt: new Date().toISOString(),
      });

      console.log(`[VideoClipping] Job ${jobId} Completed Successfully.`);
    } catch (error) {
      console.error(`[VideoClipping] Job ${jobId} Error:`, error.message);
      await db
        .collection("clip_analyses")
        .doc(jobId)
        .update({
          status: "failed",
          error: error.message || "Unknown error during analysis",
          progress: 100,
        });
    }
  }

  /**
   * Analyze video and generate clip suggestions via Python Service
   * @deprecated Use startAnalysis for async processing
   */
  async analyzeVideo(videoUrl, contentId, userId) {
    console.log(`[VideoClipping] STARTING analysis for Content: ${contentId}, User: ${userId}`);
    const db = getDb();

    try {
      // 0. Ensure worker is not stuck or forcefully reset previous job from this user (Phase 1 Fix)
      // For now, we just check health. If busy, we fail.
      // But user requested: "I lost my session, kill the previous one!"
      // So we will call /reset proactively if we are entering a new job?
      // No, that's dangerous if multiple users. But for now this is single-tenant local worker.
      // Let's just check status.
      try {
        const status = await axios.get(`${MEDIA_WORKER_URL}/status`, { timeout: 2000 });
        if (status.data.status === "busy") {
          console.warn("Worker is busy! Attempting to force reset for user request...");
          await axios.post(`${MEDIA_WORKER_URL}/reset`);
        }
      } catch (e) {
        /* ignore network error, let main call fail */
      }

      // 1. Call Python service to get clip suggestions (Phase 1: Scene Detection)
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/analyze-clips`,
        {
          video_url: videoUrl,
          target_aspect_ratio: "9:16", // Default phase 1
        },
        {
          timeout: 600000, // 10 minutes timeout for analysis (increased for initial model download/slow connections)
        }
      );

      const result = response.data;
      console.log("[VideoClipping] Python Worker Result:", result);

      // Extract suggestions (support either key from python)
      const rawSuggestions = result.clipSuggestions || result.scenes || [];

      // 2. Format suggestions consistent with frontend expectations
      // Format: { id, start, end, duration, score, reason, text }
      const formattedSuggestions = rawSuggestions.map((s, index) => ({
        id: s.id || `clip_${index}_${crypto.randomBytes(4).toString("hex")}`,
        start: s.start,
        end: s.end,
        duration: s.end - s.start,
        viralScore: s.viralScore || 60,
        reason: s.reason || "High engagement potential detected",
        text: s.text || `Segment ${index + 1}`,
        status: "suggested",
        platforms: ["TikTok", "YouTube Shorts", "Instagram Reels"], // Phase 1 defaults
        captionSuggestion: "Watch till the end! 😱 #viral",
      }));

      // 3. Store results in Firestore for persistence/history
      const analysisId = crypto.randomBytes(16).toString("hex");

      const analysisData = {
        userId,
        contentId,
        videoUrl,
        clipSuggestions: formattedSuggestions,
        status: "completed",
        createdAt: new Date().toISOString(),
        scenesDetected: formattedSuggestions.length,
        // Frontend compatibility fields
        clipsGenerated: formattedSuggestions.length,
        duration: formattedSuggestions.reduce((acc, c) => acc + c.duration, 0),
      };

      await getDb().collection("clip_analyses").doc(analysisId).set(analysisData);

      console.log(
        `[VideoClipping] Analysis complete. Saved as ${analysisId}. ${formattedSuggestions.length} clips found.`
      );

      return {
        analysisId,
        clipSuggestions: formattedSuggestions,
      };
    } catch (error) {
      console.error("[VideoClipping] Error analyzing video:", error.message);
      if (error.response) {
        console.error("Python Worker Error Details:", JSON.stringify(error.response.data));
      }
      // Re-throw to be caught by route handler
      throw new Error(`Failed to analyze video: ${error.message}`);
    }
  }

  /**
   * Render a specific clip (cut & crop) via Python Service
   * @param {string} userId
   * @param {string} analysisId
   * @param {string} clipId
   * @param {Object} options { aspectRatio }
   * @param {boolean} isMontage
   * @param {Array} montageSegments
   */
  async generateClip(
    userId,
    analysisId,
    clipId,
    options = {},
    isMontage = false,
    montageSegments = []
  ) {
    const fs = require("fs");
    console.log(
      `[VideoClipping] Rendering ${isMontage ? "Montage" : "Clip " + clipId} for user ${userId}`
    );

    try {
      // 1. Fetch Analysis Data
      const analysisRef = getDb().collection("clip_analyses").doc(analysisId);
      const analysisDoc = await analysisRef.get();

      if (!analysisDoc.exists) throw new Error("Analysis not found");
      const data = analysisDoc.data();

      if (data.userId !== userId) throw new Error("Unauthorized access to analysis");

      let response;
      let clip = {};

      if (isMontage) {
        if (!montageSegments || montageSegments.length < 2)
          throw new Error("Montage requires at least 2 segments");

        // Call Python Worker for Montage
        response = await axios.post(
          `${MEDIA_WORKER_URL}/render-montage`,
          {
            video_url: data.videoUrl,
            segments: montageSegments,
            target_aspect_ratio: options.aspectRatio || "9:16",
            add_hook: options.addHook, // e.g. "Best Moments"
          },
          { timeout: 900000 }
        ); // 15 min

        clip = {
          text: "Viral Montage",
          viralScore: 95,
          duration: montageSegments.reduce((sum, s) => sum + (s.end - s.start), 0),
        };
        // Create a dummy clip ID for the montage
        clipId = `montage-${Date.now()}`;
      } else {
        // 2. Find Clip Specs
        clip = data.clipSuggestions.find(c => c.id === clipId);
        if (!clip) throw new Error("Clip ID not found in analysis");

        // 3. Call Python Worker
        response = await axios.post(
          `${MEDIA_WORKER_URL}/render-clip`,
          {
            video_url: data.videoUrl,
            start_time: clip.start,
            end_time: clip.end,
            target_aspect_ratio: options.aspectRatio || "9:16",
          },
          { timeout: 600000 }
        ); // 10 min timeout for rendering
      }

      const { output_path } = response.data;
      if (!output_path || !fs.existsSync(output_path)) {
        throw new Error("Render failed: Output file missing");
      }

      // 4. Upload to Firebase Storage
      const bucket = getStorage();
      const destination = `generated_clips/${userId}/${clipId}_${Date.now()}.mp4`;

      await bucket.upload(output_path, {
        destination: destination,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            originalContentId: data.contentId,
            analysisId: analysisId,
            type: isMontage ? "montage" : "clip",
          },
        },
      });

      // Get Public URL (valid for long time or make public)
      const fileRef = bucket.file(destination);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 5);

      // 5. Save to Content Collection (So user sees it in dashboard)
      const newContentId = `clip-${clipId}-${Date.now()}`;

      // Also save to generated_clips for specific tracking and expiration
      await getDb()
        .collection("generated_clips")
        .doc(newContentId)
        .set({
          id: newContentId,
          userId: userId,
          url: publicUrl,
          title: isMontage ? `🔥 Viral Montage` : `Clip: ${clip.text || "Untitled"}`,
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          sourceAnalysisId: analysisId,
          sourceClipId: clipId,
          viralScore: clip.viralScore,
          duration: clip.duration,
          isMontage: isMontage || false,
        });

      await getDb()
        .collection("content")
        .doc(newContentId)
        .set({
          id: newContentId,
          userId: userId,
          type: "video",
          url: publicUrl,
          title: isMontage ? `🔥 Viral Montage` : `Clip: ${clip.text || "Untitled"}`,
          description: `AI Generated ${isMontage ? "Montage" : "Clip"} from Analysis ${analysisId}`,
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          sourceType: "ai_clip", // Helper for filtering
          sourceAnalysisId: analysisId,
          sourceClipId: clipId,
          viralScore: clip.viralScore,
          duration: clip.duration,
          isMontage: isMontage || false,
          platform_options: {
            target_platforms: clip.platforms || ["TikTok", "Instagram"],
          },
        });

      // 6. Cleanup Local File
      try {
        fs.unlinkSync(output_path);
      } catch (e) {
        console.warn("Failed to delete temp file", e);
      }

      return {
        success: true,
        contentId: newContentId,
        url: publicUrl,
      };
    } catch (error) {
      console.error("[VideoClipping] Render Error:", error);
      if (error.response) console.error("Worker Error:", error.response.data);
      throw new Error(`Render failed: ${error.message}`);
    }
  }

  // Scheduled task to auto-delete expired clips (Storage + Firestore)
  async cleanupExpiredClips() {
    const now = new Date();
    try {
      console.log("[VideoClipping] Running Cleanup Task...");

      // 1. Get expired clips from generated_clips
      const snapshot = await db
        .collection("generated_clips")
        .where("expiresAt", "<", now.toISOString())
        .limit(50) // Batch processing
        .get();

      if (snapshot.empty) {
        console.log("[VideoClipping] No expired clips found.");
        return;
      }

      console.log(`[VideoClipping] Found ${snapshot.size} expired clips.`);
      const batch = db.batch();
      const bucket = admin.storage().bucket();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const clipId = doc.id;

        // A. Delete file from Storage
        if (data.url) {
          try {
            // Extract path from URL (simple heuristic for public URLs)
            // URL format: https://storage.googleapis.com/{bucket}/{path}
            // Better to store path, but let's try to infer if stored path not available.
            // Actually, we used destination = `generated_clips/${userId}/${clipId}_${Date.now()}.mp4`
            // Let's try to find the match or just search by prefix if needed
            // But wait, makePublic() URL doesn't easily reverse to path.
            // Strategy: We can reconstruct the path format or just rely on the stored URL if we saved the path.
            // We didn't save the path explicitly, only URL.
            // Let's parse the URL.

            const urlParts = data.url.split(`https://storage.googleapis.com/${bucket.name}/`);
            if (urlParts.length === 2) {
              const filePath = decodeURIComponent(urlParts[1]);
              await bucket
                .file(filePath)
                .delete()
                .catch(err => {
                  // Ignore "Not Found" error
                  if (err.code !== 404)
                    console.error(`Failed to delete storage file ${filePath}:`, err);
                });
            } else {
              console.warn(`Could not parse storage path from URL: ${data.url}`);
            }
          } catch (storageError) {
            console.error(`Error deleting file for clip ${clipId}:`, storageError);
          }
        }

        // B. Delete from Firestore (generated_clips)
        batch.delete(doc.ref);

        // C. Also remove from content collection (or mark archived)
        // Since content ID is same as generated_clips ID? Yes: newContentId
        // `clip-${clipId}-${Date.now()}` vs `clip-${clipId}-${Date.now()}`
        // Wait, in generateClip:
        // const newContentId = `clip-${clipId}-${Date.now()}`;
        // await db.collection("generated_clips").doc(newContentId).set(...)
        // await db.collection("content").doc(newContentId).set(...)
        // So IDs match.
        const contentRef = db.collection("content").doc(clipId);
        batch.delete(contentRef);
      }

      await batch.commit();
      console.log(`[VideoClipping] Successfully cleaned up ${snapshot.size} clips.`);
    } catch (error) {
      console.error("[VideoClipping] Cleanup failed:", error);
    }
  }
}

module.exports = new VideoClippingService();
