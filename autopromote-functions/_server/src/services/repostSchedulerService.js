// repostSchedulerService.js - determine when to enqueue repost tasks based on decay & engagement
const { db } = require("../firebaseAdmin");
const { enqueuePlatformPostTask, enqueueMediaTransform } = require("./promotionTaskQueue");
const performanceValidationEngine = require("./performanceValidationEngine");
const monetizationService = require("./monetizationService"); // This will leverage the new results-based logic
const logger = require("./logger");

/* Heuristic:
   For each content with at least one successful platform_post in last REPOST_LOOKBACK_HOURS,
   compute decay = (latest impressions delta / hours since first post). If impressions growth per hour
   has dropped below threshold but total impressions < potential ceiling (based on youtube velocity or prior top post),
   schedule a repost (platform_post task with reason 'decay_repost').
*/

async function analyzeAndScheduleReposts({ limit = 10 }) {
  const hours = parseInt(process.env.REPOST_LOOKBACK_HOURS || "24", 10);
  const since = Date.now() - hours * 3600000;
  const postsSnap = await db
    .collection("platform_posts")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  const byContentPlatform = {};
  postsSnap.forEach(d => {
    const v = d.data();
    const ts =
      v.createdAt && v.createdAt.toMillis
        ? v.createdAt.toMillis()
        : Date.parse(v.createdAt || "") || 0;
    if (ts < since) return;
    const key = v.contentId + "|" + v.platform;
    if (!byContentPlatform[key]) byContentPlatform[key] = [];
    byContentPlatform[key].push({ ...v, ts });
  });
  const tasks = [];
  for (const [, arr] of Object.entries(byContentPlatform)) {
    if (tasks.length >= limit) break;
    if (arr.length < 1) continue;
    arr.sort((a, b) => a.ts - b.ts);
    const first = arr[0];
    const latest = arr[arr.length - 1];
    const hoursSpan = Math.max((latest.ts - first.ts) / 3600000, 1 / 12);
    // Aggregate impressions
    let impressions = 0;
    arr.forEach(p => {
      if (p.metrics && p.metrics.impressions) impressions += p.metrics.impressions;
    });
    const growthPerHour = impressions / hoursSpan;
    const velocityThreshold = parseFloat(process.env.REPOST_MIN_GROWTH_PER_HOUR || "5");
    const maxImpressionsCap = parseInt(process.env.REPOST_MAX_IMPRESSIONS_CAP || "5000", 10);
    if (growthPerHour < velocityThreshold && impressions < maxImpressionsCap) {
      // Check cooldown: ensure we haven't reposted for same (content,platform) recently
      const cooldownHrs = parseInt(process.env.REPOST_COOLDOWN_HOURS || "6", 10);
      const lastTs = latest.ts;
      if (Date.now() - lastTs < cooldownHrs * 3600000) continue;
      tasks.push({
        contentId: latest.contentId,
        platform: latest.platform,
        impressions,
        growthPerHour,
      });
    }
  }
  // Enqueue repost tasks
  let scheduled = 0;
  for (const t of tasks.slice(0, limit)) {
    try {
      // -----------------------------------------------------------------------
      // SAFETY CHECK 1: Verify no recent post exists (Direct Query)
      // The initial snapshot only grabbed 500 records; if traffic is high, 
      // the "latest" post might have been missed, leading to a false positive for decay.
      // -----------------------------------------------------------------------
      try {
        const checkSnap = await db.collection("platform_posts")
          .where("contentId", "==", t.contentId)
          .where("platform", "==", t.platform)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();

        if (!checkSnap.empty) {
          const lastPost = checkSnap.docs[0].data();
          const lastTs = lastPost.createdAt && lastPost.createdAt.toMillis 
            ? lastPost.createdAt.toMillis() 
            : (Date.parse(lastPost.createdAt || "") || 0);

          const safeCooldownHours = parseInt(process.env.REPOST_COOLDOWN_HOURS || "6", 10);
          if (Date.now() - lastTs < safeCooldownHours * 3600000) {
            console.log(`[RepostScheduler] Safety Check Blocked: Found recent post for ${t.contentId} from ${lastPost.createdAt}`);
            continue;
          }
        }
      } catch (checkErr) {
        console.warn(`[RepostScheduler] Safety check failed (index missing?), blocking ${t.contentId} to be safe:`, checkErr.message);
        continue; // FAIL SAFE: Do not repost if we can't verify history.
      }

      // -----------------------------------------------------------------------
      // SAFETY CHECK 2: Verify no PENDING task exists
      // If the queue is backed up, we don't want to stack 10 repost requests.
      // -----------------------------------------------------------------------
      const pendingSnap = await db.collection("promotion_tasks")
        .where("contentId", "==", t.contentId)
        .where("platform", "==", t.platform)
        .where("status", "in", ["queued", "processing"])
        .limit(1)
        .get();
      
      if (!pendingSnap.empty) {
        console.log(`[RepostScheduler] Skipping ${t.contentId} - Task already pending.`);
        continue;
      }

      const contentSnap = await db.collection("content").doc(t.contentId).get();
      const uid = contentSnap.exists ? contentSnap.data().user_id || contentSnap.data().uid : null;
      if (!uid) continue;

      // VISUAL FIX: Create a "schedule" entry so it appears on the Dashboard Timeline
      try {
        const nextTime = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // 5 mins
        db.collection("promotion_schedules")
          .add({
            contentId: t.contentId,
            user_id: uid,
            platform: t.platform,
            startTime: nextTime,
            scheduleType: "auto_repost",
            isActive: true,
            status: "processing", // Mark as processing since we are queueing task immediately
            reason: "view_decay_detected",
            message: "Auto-Promote Decay Cycle",
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
      } catch (_) {}

      // STRATEGIC: Rotate captions to avoid spam filters
      const strategicCaptions = [
        "Bringing this back because it deserves another look!",
        "ICYMI: One of our favorites.",
        "Highlight of the week 🌟",
        "Re-sharing this gem for the new followers.",
        "Still thinking about this one..."
      ];
      const randomCaption = strategicCaptions[Math.floor(Math.random() * strategicCaptions.length)];

      // STRATEGIC REPOST: Route through Media Transform first to generate unique hash
      // This changes the file binary (brightness/metadata) so platforms treat it as "fresh" content.
      try {
        const sourceUrl = t.mediaUrl || t.payload?.mediaUrl || t.payload?.url;
        if (sourceUrl) {
            console.log(`[RepostScheduler] Routing ${t.contentId} through Strategic Transform for safety.`);
            await enqueueMediaTransform({
                contentId: t.contentId,
                uid,
                sourceUrl,
                meta: {
                     // This triggers the chain
                    postAfterTransform: [t.platform],
                    nextMessage: randomCaption,
                    platformOptions: { repost_reason: "decay_optimization" },
                    // Transform settings
                    trimStart: 0, // No trim, just brightness shift
                    quality_enhanced: true 
                }
            });
            scheduled++;
            continue; // Task queued via transform, move to next
        }
      } catch(e) {
          console.warn(`[RepostScheduler] Transform queue failed, falling back to direct post: ${e.message}`);
      }

      await enqueuePlatformPostTask({
        contentId: t.contentId,
        uid,
        platform: t.platform,
        reason: "decay_repost",
        payload: { message: randomCaption },
        skipIfDuplicate: true,
        isOptimizationRun: true, // Flag this as an optimization that needs validation
      });
      scheduled++;
    } catch (e) {
      /* ignore */
    }
  }

  // Auto-schedule verification for recent optimization posts
  await scheduleResultVerifications(5);

  return { analyzed: Object.keys(byContentPlatform).length, scheduled };
}

/**
 * ORCHESTRATOR: Scans for optimization posts published > 24 hours ago that haven't been validated
 * Phase: "Judge and Charge"
 */
async function scheduleResultVerifications(limit = 5) {
  try {
    // Look for posts that are at least 24 hours old (so metrics have settled)
    const minAge = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // But not older than 7 days (ancient history checks)
    const maxAge = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Query platform_posts where we flagged 'isOptimizationRun' but haven't 'validated'
    // Note: This requires a composite index if we sort, but for now we limit 5
    const snapshot = await db.collection("platform_posts")
      .where("isOptimizationRun", "==", true)
      .where("validationStatus", "==", "pending") 
      .where("createdAt", "<", minAge)
      .limit(limit)
      .get();
    
    if (snapshot.empty) return;

    logger.info(`[ValidationOrchestrator] Processing ${snapshot.size} optimization results...`);

    for (const doc of snapshot.docs) {
      const post = doc.data();
      const variantId = doc.id;
      const originalContentId = post.contentId;
      const userId = post.uid || post.user_id;

      if (!userId || !originalContentId) continue;

      // 1. Find the BASELINE (Original) post to compare against
      // We look for the most RECENT successful post (not the oldest) to judge revival performance
      let originalPostId = post.baselinePostId;

      if (!originalPostId) {
        try {
            // Fetch potential baselines (limit 10 to avoid heavy reads, sort in memory to be safe)
            const originals = await db.collection("platform_posts")
            .where("contentId", "==", originalContentId)
            .where("platform", "==", post.platform)
            .get();
            
            if (!originals.empty) {
                // Filter: Must be created BEFORE the variant
                // Sort: Newest first (to compare against latest performance, not ancient viral hits)
                const candidates = originals.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(d => d.id !== variantId && new Date(d.createdAt) < new Date(post.createdAt))
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                if (candidates.length > 0) {
                    originalPostId = candidates[0].id;
                }
            }
        } catch(e) {
            logger.warn(`[ValidationOrchestrator] Error finding baseline: ${e.message}`);
        }
      }

      if (!originalPostId || originalPostId === variantId) {
        // If we can't find a baseline (e.g. first post), we can't judge lift.
        // Mark as "baseline_missing" so we don't retry forever.
        // We do NOT charge the user in this case (safe fallback).
        await doc.ref.update({ validationStatus: "baseline_missing" });
        continue;
      }

      // 2. Validate Performance (Did it work?)
      const validation = await performanceValidationEngine.validatePerformance(originalPostId, variantId);

      if (!validation || !validation.success) {
        logger.warn(`[ValidationOrchestrator] Validation failed internal error for ${variantId}`);
        continue;
      }

      // 3. Process Charge (If successful)
      const chargeResult = await monetizationService.processResultsBasedCharge(
        userId, 
        validation.report // contains { isImproved, lift, etc. }
      );

      // 4. Update Status and Log Result
      await doc.ref.update({
        validationStatus: "completed",
        validationResult: validation.report,
        chargeResult: chargeResult,
        validatedAt: new Date().toISOString()
      });

      const lift = validation.report?.lift?.views || 0;
      if (chargeResult.charged) {
        logger.info(`[ValidationOrchestrator] CHARGED user ${userId} ${chargeResult.amount} credits. Lift: ${lift}%`);
      } else {
        logger.info(`[ValidationOrchestrator] NO CHARGE for user ${userId}. Improvement (${lift}%) did not meet threshold.`);
      }
    }

  } catch (error) {
    logger.error("Error in scheduleResultVerifications:", error);
  }
}


module.exports = { analyzeAndScheduleReposts };
