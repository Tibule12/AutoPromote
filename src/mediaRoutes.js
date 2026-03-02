const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
// Import as class to instantiate per request or use singleton if it's stateless
// The service file exports an instance by default? No, let's check.
const VideoEditingService = require("./services/videoEditingService");
const videoEditingService = new VideoEditingService(); // Instantiate for general use

const authMiddleware = require("./authMiddleware");
const { deductCredits } = require("./creditSystem");

// Configure Multer (Buffer storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB Limit
});

// Middleware to verify Firebase Token and attach user
// Replaced local 'protect' with standard 'authMiddleware' for consistency
router.use(authMiddleware);

// Route: POST /api/media/transcribe
// Handles file upload -> Firebase Storage -> Python Worker -> Returns Captions
router.post("/transcribe", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.user.uid;
    const bucket = admin.storage().bucket();
    const filename = `temp_transcribe/${userId}/${uuidv4()}_${req.file.originalname}`;
    const blob = bucket.file(filename);

    console.log(`[MediaRoute] Uploading file for transcription: ${filename}`);

    // 1. Upload to Firebase Storage
    const blobStream = blob.createWriteStream({
      metadata: { contentType: req.file.mimetype },
    });

    blobStream.on("error", err => {
      console.error(err);
      res.status(500).json({ error: "Upload to storage failed" });
    });

    blobStream.on("finish", async () => {
      // 2. Get Signed URL (or make public? Signed is safer)
      // Python worker needs to access it.
      const [url] = await blob.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60, // 1 hour
      });

      console.log(`[MediaRoute] File uploaded. Sending to Python Worker...`);

      // 3. Call Service (Async Job)
      try {
        // Old sync: const segments = await videoEditingService.transcribeVideo(url);
        const job = await videoEditingService.startTranscriptionJob(url, userId);
        res.json({ success: true, jobId: job.jobId, message: "Transcription started" });
      } catch (err) {
        res.status(500).json({ error: "Transcription service failed: " + err.message });
      }
    });

    blobStream.end(req.file.buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Route: POST /api/media/process
// Body: { fileUrl: "...", options: { smartCrop: true, silenceRemoval: true, ... } }
router.post("/process", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, options } = req.body;
  console.log("[MediaRoute] Received request:", { fileUrl, options });
  const cost = 10; // Cost per edit

  if (!fileUrl) {
    return res.status(400).json({ message: "No file provided" });
  }

  // 1. Deduct Credits
  try {
    /* Temporarily bypass for testing
    const result = await deductCredits(userId, cost);
    if (!result.success) {
      return res.status(403).json({ 
        message: "Insufficient credits. Please upgrade or top up.",
        required: cost
      });
    }
    */
    const result = { success: true, remaining: 999 };

    // 2. Delegate to Service (Async Job Queue)
    // Old sync method: const processResult = await videoEditingService.processVideo(fileUrl, options, userId);
    // New async method: returns { jobId }
    const job = await videoEditingService.startProcessingJob(fileUrl, options, userId);

    // 3. Return Job ID + remaining credits (or defer credit check)
    // Note: The frontend needs to poll /status/:jobId now.
    res.json({
      success: true,
      jobId: job.jobId,
      message: "Processing started",
      remainingCredits: result.remaining,
    });
  } catch (error) {
    console.error("[MediaRoute] Processing error:", error.message);
    res.status(500).json({ message: "Media processing failed", details: error.message });
  }
});

// Route: GET /api/media/status/:jobId
// Check status of async video processing
router.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.uid;

    const doc = await admin.firestore().collection("video_edits").doc(jobId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const data = doc.data();
    // Security check: ensure user owns the job
    if (data.userId !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to job" });
    }

    res.json({
      success: true,
      status: data.status,
      progress: data.progress,
      result: data.result, // Contains { url } if completed
      error: data.error,
    });
  } catch (e) {
    console.error("Status check failed:", e);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Phase 2: Viral Clip Analysis
router.post("/analyze", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl } = req.body;
  const cost = 20; // Higher cost for analysis

  try {
    console.log(`[MediaRoute] Analyze clip request for user ${userId}, file: ${fileUrl}`);
    // Temporarily bypass credit check for testing if needed
    // const creditRes = await deductCredits(userId, cost);

    const creditRes = { success: true, remaining: 999 }; // Bypass for testing
    /*
      const creditRes = await deductCredits(userId, cost);
      if (!creditRes.success) {
        console.warn(`[MediaRoute] Insufficient credits for user ${userId}. Required: ${cost}, Msg: ${creditRes.message}`);
        return res.status(403).json({ message: "Insufficient credits", details: creditRes.message });
      }
      */

    console.log(`[MediaRoute] Credits OK. Starting analysis...`);
    const scenes = await videoEditingService.analyzeVideo(fileUrl, userId);
    res.json({ success: true, scenes: scenes, remainingCredits: creditRes.remaining });
  } catch (error) {
    console.error(`[MediaRoute] Analyze error:`, error);
    res.status(500).json({ message: "Analysis failed", details: error.message });
  }
});

// Phase 2: Render Specific Clip
router.post("/render-clip", async (req, res) => {
  const userId = req.user.uid;
  const { fileUrl, startTime, endTime } = req.body;
  const cost = 5; // Simpler cut is cheaper

  try {
    /*
      const creditRes = await deductCredits(userId, cost);
      if (!creditRes.success) return res.status(403).json({ message: "Insufficient credits" });
      */
    const creditRes = { success: true, remaining: 9999 };

    const result = await videoEditingService.renderClip(fileUrl, startTime, endTime, userId);
    res.json({ success: true, url: result.url, remainingCredits: creditRes.remaining });
  } catch (error) {
    res.status(500).json({ message: "Rendering failed", details: error.message });
  }
});

// Phase 3: Memetic Composer (Viral Engineering)
router.post("/memetic/plan", async (req, res) => {
  const userId = req.user.uid;
  const { baseVariant, options, soundId } = req.body;

  console.log(`[Memetic] Planning mutations for user ${userId}`, baseVariant);

  // In a real implementation:
  // 1. Send base params to Python worker (AI model trained on viral clips)
  // 2. Worker generates 3-6 mutation strategies based on "genes"
  // 3. Return these strategies as a plan

  // For MVP, we simulate the AI planning phase:
  try {
    const variants = [
      {
        id: `v_${Date.now()}_1`,
        title: "High-Velocity Hook",
        style: "viral",
        viralScore: 88 + Math.floor(Math.random() * 10),
        reason: `Detected ${(baseVariant.tempo || 1.0).toFixed(1)}x tempo preference. Applied rapid cuts in first 3s.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/FF0000/FFFFFF?text=HOOK+MAX",
        previewUrl: "", // In real app, this would be a rendered preview
      },
      {
        id: `v_${Date.now()}_2`,
        title: "Emotional Resonance",
        style: "cute",
        viralScore: 75 + Math.floor(Math.random() * 15),
        reason: `Valence set to ${(baseVariant.ctaIntensity * 100).toFixed(0)}%. Softened color grading and acoustic sync.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/FF69B4/FFFFFF?text=CUTE+MOOD",
      },
      {
        id: `v_${Date.now()}_3`,
        title: "Chaos Mode",
        style: "chaos",
        viralScore: 90 + Math.floor(Math.random() * 8),
        reason: `Ambiguity ${(baseVariant.ambiguity * 100).toFixed(0)}% triggered glitch effects and non-linear editing.`,
        thumbnailUrl: "https://via.placeholder.com/320x180/000000/00FF00?text=GLITCH+CORE",
      },
    ];

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    res.json({
      id: `plan_${Date.now()}`,
      variants,
    });
  } catch (error) {
    console.error("[Memetic] Plan generation failed:", error);
    res.status(500).json({ message: "Failed to generate plan" });
  }
});

// Phase 3.5: Memetic Preview (Actually Render Video)
router.post("/memetic/preview", async (req, res) => {
  // Check user auth or use fallback for testing
  const userId = req.user && req.user.uid ? req.user.uid : "test_user";
  const { videoUrl, variantId, style } = req.body;

  console.log(`[Memetic] Generating PREVIEW for user ${userId}, style=${style}`);

  // Map style to Python Worker Options
  let options = {
    smartCrop: true,
    cropStyle: "blur",
    captions: true,
    addHook: true,
    addMusic: true,
  };

  if (style === "viral") {
    options.hookText = "WAIT FOR IT 😱";
    options.musicFile = "intense.mp3";
    options.musicVolume = 0.3;
  } else if (style === "cute") {
    options.hookText = "So Wholesome ❤️";
    options.musicFile = "lofi.mp3";
    options.musicVolume = 0.2;
  } else if (style === "chaos") {
    options.hookText = "What just happened?!";
    options.musicFile = "upbeat.mp3";
    options.musicVolume = 0.5;
  } else {
    // Default / Fallback
    options.hookText = "Watch This!";
    options.musicFile = "upbeat.mp3";
    options.musicVolume = 0.2;
  }

  try {
    // Instantiate service (VideoEditingService is a class now)
    const service = new VideoEditingService();

    const result = await service.processVideo(videoUrl, options, userId);

    res.json({
      success: true,
      previewUrl: result.url,
    });
  } catch (error) {
    console.error("[Memetic] Preview generation failed:", error);
    res.status(500).json({ message: "Failed to generate preview", error: error.message });
  }
});

router.post("/memetic/seed", async (req, res) => {
  // This would actually schedule the post or start the A/B test
  const { planId } = req.body;
  console.log(`[Memetic] Seeding plan ${planId}`);

  // Simulate DB update
  setTimeout(() => {
    res.json({ success: true, message: "Seeding initiated. Cohort: Global" });
  }, 1000);
});

module.exports = router;
