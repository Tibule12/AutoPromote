const express = require("express");
const router = express.Router();
const videoClippingService = require("../services/videoClippingService");
const authMiddleware = require("../authMiddleware");
const { deductCredits } = require("../creditSystem");
const { db } = require("../firebaseAdmin");

const CLIP_ANALYSIS_COST = 0; // Cost per analysis (Phase 1 default)

/**
 * @route POST /analyze
 * @desc Analyze video for clips (Deducts credits)
 * @access Private
 */
router.post("/analyze", authMiddleware, async (req, res) => {
  const { videoUrl, contentId } = req.body;
  const userId = req.user.uid;

  console.log(`[ClipRoute] Request from ${userId} for ${contentId}`);

  if (!videoUrl || !contentId) {
    return res.status(400).json({ error: "Missing videoUrl or contentId" });
  }

  try {
    // 1. Check & Deduct Credits
    // returns { success: true, remaining: X } or { success: false, message: ... }
    const creditResult = await deductCredits(userId, CLIP_ANALYSIS_COST);

    if (!creditResult.success && CLIP_ANALYSIS_COST > 0) {
      console.warn(`[ClipRoute] Insufficient credits for ${userId}`);
      return res.status(402).json({
        error: "Insufficient credits",
        required: CLIP_ANALYSIS_COST,
        details: creditResult.message,
      });
    }

    console.log(`[ClipRoute] Credits deducted. Remaining: ${creditResult.remaining}`);

    // Call Process Async
    // Now returns jobId immediately
    const result = await videoClippingService.startAnalysis(videoUrl, contentId, userId);

    // 3. Return result with remaining credits info
    res.json({
      success: true,
      analysisId: result, // This is the job ID
      // Optional: keep 'data' field for compatibility if frontend expects immediate result
      // but frontend should check status now.
      message: "Analysis started successfully. Poll /status/{analysisId} for progress.",
      creditsRemaining: creditResult.remaining,
      async: true, // Tell frontend expecting immediate result that this is async
    });
  } catch (error) {
    console.error("[ClipRoute] Error:", error.message);
    res.status(500).json({ error: "Analysis failed", details: error.message });
  }
});

/**
 * @route POST /generate
 * @desc Generate (Render) a specific clip from analysis
 */
router.post("/generate", authMiddleware, async (req, res) => {
  const { analysisId, clipId, isMontage, montageSegments, options } = req.body;
  const userId = req.user.uid;

  console.log(`[ClipRoute] Generate request for analysis ${analysisId} (Montage: ${isMontage})`);

  if (!analysisId) {
    return res.status(400).json({ error: "Missing analysisId" });
  }

  if (!isMontage && !clipId) {
    return res.status(400).json({ error: "Missing clipId for single clip generation" });
  }

  try {
    // Note: Rendering consumes "server time" credits potentially, but for Phase 1 we'll skip deduction
    // or assume analysis cost covers it.

    // Pass everything to service
    const result = await videoClippingService.generateClip(
      userId,
      analysisId,
      clipId,
      options,
      isMontage,
      montageSegments
    );

    res.json({
      success: true,
      message: "Clip generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("[ClipRoute] Generate Error:", error.message);
    res.status(500).json({ error: "Clip generation failed", details: error.message });
  }
});

const getUserAnalyses = async (req, res) => {
  const userId = req.user.uid;
  try {
    const snapshot = await db
      .collection("clip_analyses")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const history = [];
    snapshot.forEach(doc => {
      // Clean up fields for frontend
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        // Calculate generated clips count for display
        clipCount: (data.clipSuggestions || []).length,
      });
    });

    res.json({ clips: history });
  } catch (error) {
    console.error("[ClipRoute] Analysis History error:", error);
    res.status(500).json({ error: "Failed to fetch analysis history" });
  }
};

/**
 * @route GET /history
 * @desc Get user's clip analysis history
 */
router.get("/history", authMiddleware, getUserAnalyses);

/**
 * @route GET /user
 * @desc Get user's GENERATED clips (the ones they chose to keep)
 * @access Private
 */
router.get("/user", authMiddleware, async (req, res) => {
  const userId = req.user.uid;
  try {
    // Fetch generated clips for this specific user
    // Note: This query requires a composite index: userId ASC, sourceType ASC, createdAt DESC
    // If index is missing, this will throw an error with a link to create it.

    // Simplification for rapid fix:
    // If the complex query fails, fall back to a simpler query and filter in memory
    let snapshot;
    try {
      snapshot = await db
        .collection("content")
        .where("userId", "==", userId)
        .where("sourceType", "==", "ai_clip")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    } catch (err) {
      console.warn(
        "[ClipRoute] Complex query failed (likely missing index), falling back to simple query:",
        err.message
      );
      // Fallback: Just get by userId and filter
      snapshot = await db
        .collection("content")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
    }

    const clips = [];
    const now = new Date();

    snapshot.forEach(doc => {
      const data = doc.data();
      // Filter out expired clips if an expiration date is set
      if (data.expiresAt) {
        const expiry = new Date(data.expiresAt);
        if (expiry < now) return;
      }
      clips.push({ id: doc.id, ...data });
    });

    res.json({ clips, count: clips.length });
  } catch (error) {
    console.error("[ClipRoute] Generated Clips error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch generated clips", details: error.message });
    }
  }
});

/**
 * @route GET /analysis/:id
 * @desc Get specific analysis result
 * @access Private
 */
router.get("/analysis/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await db.collection("clip_analyses").doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    // Ensure user owns it
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({ analysis: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error("Fetch analysis error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route POST /:clipId/export
 * @desc Export a specific clip to the Content Library for posting
 * @access Private
 */
router.post("/:clipId/export", authMiddleware, async (req, res) => {
  try {
    const { clipId } = req.params;
    const { platforms = [], scheduledTime, caption } = req.body;
    const userId = req.user.uid;

    if (!clipId) return res.status(400).json({ error: "Clip ID required" });

    // 1. Find the Analysis containing this clip
    // Optimally, we should find which analysis doc has this clip.
    // Since Phase 1 stores clips inside the 'clip_analyses' doc in 'clipSuggestions' array,
    // we might need to search or pass the analysisId.
    // For simplicity in Phase 1, we'll assume the client sends the analysisId or we query for it.
    // Use a Collection Group Query if needed, or just assume analysisId is passed in body for efficiency.

    let analysisId = req.body.analysisId;
    let clipData = null;
    let analysisDoc = null;

    if (analysisId) {
      analysisDoc = await db.collection("clip_analyses").doc(analysisId).get();
      if (analysisDoc.exists) {
        const data = analysisDoc.data();
        clipData = data.clipSuggestions.find(c => c.id === clipId);
      }
    } else {
      // Fallback: This is expensive, better to pass analysisId
      const snapshot = await db
        .collection("clip_analyses")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      for (const doc of snapshot.docs) {
        const found = (doc.data().clipSuggestions || []).find(c => c.id === clipId);
        if (found) {
          clipData = found;
          analysisDoc = doc;
          analysisId = doc.id;
          break;
        }
      }
    }

    if (!clipData) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // 2. Create Content Entry
    const contentPayload = {
      userId,
      title: caption || clipData.text || `Clip ${clipId}`,
      description: caption || clipData.reason || "",
      type: "video",
      url: analysisDoc.data().videoUrl, // Use original video URL for now, Phase 2 will duplicate/trim
      sourceType: "ai_clip",
      sourceClipId: clipId,
      sourceAnalysisId: analysisId,
      virtualClip: {
        // Store start/end times for the player to handle
        start: clipData.start,
        end: clipData.end,
        duration: clipData.duration,
      },
      viralScore: clipData.viralScore,
      target_platforms: platforms,
      status: "approved", // auto-approve generated content
      createdAt: new Date().toISOString(),
      sourceContext: "clip_studio",
    };

    const contentRef = await db.collection("content").add(contentPayload);

    // 3. Create Schedule if requested
    if (scheduledTime) {
      await db.collection("promotion_schedules").add({
        userId,
        contentId: contentRef.id,
        platforms,
        scheduledTime,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      contentId: contentRef.id,
      message: "Clip exported to Content Library",
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

/**
 * @route POST /memetic/seed
 * @desc Start a memetic experiment (seed phase)
 * @access Private
 */
router.post("/memetic/seed", authMiddleware, async (req, res) => {
  const { plan, options, contentId } = req.body;
  // Use user id from auth middleware
  const userId = req.user.uid;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "Plan array is required" });
  }

  try {
    // 1. If contentId is provided, enforce ownership
    if (contentId) {
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) {
        return res.status(404).json({ error: "Content not found" });
      }
      const data = contentDoc.data();
      // Handle legacy 'user_id' vs 'userId'
      const owner = data.user_id || data.userId;
      if (owner !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    // 2. Create experiment doc
    const experimentData = {
      userId,
      plan,
      options: options || {},
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (contentId) {
      experimentData.contentId = contentId;
    }

    const docRef = await db.collection("memetic_experiments").add(experimentData);

    res.json({
      success: true,
      experimentId: docRef.id,
    });
  } catch (error) {
    console.error("[ClipRoute] Memetic seed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
