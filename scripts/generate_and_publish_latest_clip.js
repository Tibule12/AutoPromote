/**
 * Script: generate_and_publish_latest_clip.js
 * Usage: node scripts/generate_and_publish_latest_clip.js [UID]
 * - If UID omitted, defaults to bf04dPKELvVMivWoUyLsAVyw2sg2 (your test UID from earlier convo)
 * NOTE: This will perform a LIVE upload to YouTube using the stored connection for the UID.
 */

const { admin, db } = require("../src/firebaseAdmin");
const videoClippingService = require("../src/services/videoClippingService");
const { uploadVideo, getUserYouTubeConnection } = require("../src/services/youtubeService");

async function findLatestVideoContent(uid) {
  const snaps = await db
    .collection("content")
    .where("userId", "==", uid)
    .where("type", "==", "video")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  const items = [];
  snaps.forEach(s => items.push({ id: s.id, data: s.data() }));
  // Pick first with a usable URL
  for (const it of items) {
    const url = it.data.url || it.data.processedUrl || it.data.fileUrl;
    if (url) return { id: it.id, url, data: it.data };
  }
  return null;
}

async function main() {
  try {
    const uid = process.argv[2] || "bf04dPKELvVMivWoUyLsAVyw2sg2";
    console.log("[Script] Running generate & publish for UID:", uid);

    // Verify YouTube connection present
    const conn = await getUserYouTubeConnection(uid);
    if (!conn || !conn.tokens) {
      console.error("[Script] YouTube connection missing for UID:", uid);
      process.exit(1);
    }

    const latest = await findLatestVideoContent(uid);
    if (!latest) {
      console.error("[Script] No recent video content found for UID:", uid);
      process.exit(1);
    }

    console.log("[Script] Found content:", latest.id, latest.url);

    // Analyze the video
    console.log("[Script] Starting analysis (this may take a while)...");
    const analysis = await videoClippingService.analyzeVideo(latest.url, latest.id, uid);
    console.log("[Script] Analysis complete. Clips suggested:", (analysis.topClips || []).length);

    const top = (analysis.topClips && analysis.topClips[0]) || null;
    if (!top) {
      console.error("[Script] No clip suggestions returned by analyzer.");
      process.exit(1);
    }

    console.log("[Script] Generating clip id:", top.id, "start/end:", top.start, top.end);
    const genRes = await videoClippingService.generateClip(analysis.analysisId, top.id, { aspectRatio: "16:9" });
    console.log("[Script] Generate result:", genRes && genRes.url);

    // Find the generated clip doc (most recent for this analysisId/clipId)
    const snap = await db
      .collection("generated_clips")
      .where("analysisId", "==", analysis.analysisId)
      .where("clipId", "==", top.id)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) {
      console.error("[Script] Generated clip doc not found in Firestore.");
      process.exit(1);
    }

    const clipDoc = snap.docs[0];
    const clipData = clipDoc.data();
    console.log("[Script] Generated clip saved:", clipDoc.id, clipData.url);

    // Create content doc for the clip
    const contentPayload = {
      userId: uid,
      title: clipData.caption || `AI clip from ${latest.id}`,
      description: clipData.caption || "",
      type: "video",
      url: clipData.url,
      sourceType: "ai_clip",
      sourceClipId: clipDoc.id,
      sourceAnalysisId: clipData.analysisId,
      viralScore: clipData.viralScore,
      duration: clipData.duration,
      target_platforms: ["youtube"],
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    const contentRef = await db.collection("content").add(contentPayload);
    const contentId = contentRef.id;
    console.log("[Script] Created content doc:", contentId);

    // Upload to YouTube using stored connection
    console.log("[Script] Uploading to YouTube... This will use the service account and stored user connection.");
    const uploadOutcome = await uploadVideo({
      uid,
      title: contentPayload.title,
      description: contentPayload.description,
      fileUrl: clipData.url,
      contentId,
      shortsMode: false,
      optimizeMetadata: true,
    });

    console.log("[Script] YouTube upload outcome:", uploadOutcome);
    if (uploadOutcome && uploadOutcome.success) {
      console.log("[Script] Upload succeeded. videoId:", uploadOutcome.videoId);
      process.exit(0);
    } else {
      console.error("[Script] Upload failed:", uploadOutcome);
      process.exit(1);
    }
  } catch (e) {
    console.error("[Script] Error:", e && e.message ? e.message : e);
    console.error(e && e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
