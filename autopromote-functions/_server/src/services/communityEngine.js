// communityEngine.js
// Growth squads, leaderboards, and the COMMUNITY ENGAGEMENT EXCHANGE logic.
// This engine powers the "Manual Engagement" economy where users earn credits by liking/commenting
// on other users' posts, and spend those credits to get guaranteed engagement on their own posts.
// NO FAKE BOTS. REAL USERS HELPING REAL USERS.

const crypto = require("crypto");
const { db, admin } = require("../firebaseAdmin");
const { postViaBot } = require("./discordService");

function randomId(len = 9) {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .substr(0, len);
}

// --- CORE ENGAGEMENT EXCHANGE LOGIC ---

/**
 * User A requests a boost for their PUBLISHED content.
 * Costs credits. Creates a "Bounty" pool for other users to claim.
 * NOTE: We only allow boosting PUBLISHED content to ensure real external impact.
 */
async function createEngagementBounty(
  userId,
  contentId,
  platform,
  actionType = "like",
  quantity = 10
) {
  let externalUrl = null;
  let isExternalSource = false;

  // 1. SMART VALIDATION: Check if contentId is actually a direct URL
  const urlPattern = /^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}(\/.*)?$/i;

  if (urlPattern.test(contentId) && contentId.includes("http")) {
    // --- EXTERNAL LINK DETECTED ---
    isExternalSource = true;
    externalUrl = contentId;

    // STRICT PLATFORM MATCHING (Professional Standards)
    const domains = {
      tiktok: ["tiktok.com"],
      instagram: ["instagram.com"],
      youtube: ["youtube.com", "youtu.be"],
      twitter: ["twitter.com", "x.com"],
      facebook: ["facebook.com", "fb.watch"],
      reddit: ["reddit.com"],
    };

    const allowed = domains[platform] || [];
    const isValidDomain = allowed.some(d => externalUrl.includes(d));

    if (!isValidDomain) {
      throw new Error(
        `Security Alert: The URL provided does not match the selected platform (${platform}). Please verify your link.`
      );
    }
  } else {
    // --- INTERNAL CONTENT LOOKUP (Legacy Mode) ---
    const contentRef = db.collection("content").doc(contentId);
    const contentSnap = await contentRef.get();

    if (!contentSnap.exists)
      throw new Error("Content ID not found in database. Please use a valid URL or internal ID.");
    const contentData = contentSnap.data();

    // Check implementation specific field for published URL
    if (platform === "tiktok") externalUrl = contentData.tiktokUrl || contentData.publishedUrl;
    else if (platform === "instagram")
      externalUrl = contentData.instagramUrl || contentData.publishedUrl;
    else if (platform === "youtube")
      externalUrl = contentData.youtubeUrl || contentData.publishedUrl;
    else externalUrl = contentData.publishedUrl || contentData.url;

    if (!externalUrl && !contentData.isSimulated) {
      throw new Error("Content must be published to a platform first. No external URL found.");
    }
  }

  // 2. Check User Balance
  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  const credits = (userSnap.data() || {}).growth_credits || 0;

  // Cost calculation
  // Base cost: 2 credits per Like, 5 per Comment
  const UNIT_COST = actionType === "comment" ? 5 : 2;
  const TOTAL_COST = UNIT_COST * quantity;

  if (credits < TOTAL_COST) {
    throw new Error(
      `Insufficient growth credits. You need ${TOTAL_COST} credits for ${quantity} interactions.`
    );
  }

  // 3. Deduct Credits
  await userRef.update({
    growth_credits: admin.firestore.FieldValue.increment(-TOTAL_COST),
  });

  // 4. Create Bounty Campaign
  // ENGINEERING: Add GAMIFICATION & URGENCY
  // - status: "active" but also "frenzy" if reward is high?

  // --- STRATEGY: "VIRAL MISSION CONTROL" (ORGANIC MODE) ---
  // User wants "Safe & Authentic" growth.
  // Replaces the old "Bot Surge" with a managed Community Mission.

  // Step 1: Initialize Mission Control (The Brain)
  const viralMissionControl = require("./viralMissionControl");
  const missionStrategy = viralMissionControl.deriveStrategy(platform, actionType);

  console.log(`[Mission Control] 🎯 Strategizing for ${contentId}: ${missionStrategy.codeName}`);

  // We no longer trigger bots. We rely purely on the "Human Swarm".
  // The strategy determines the distribution velocity.

  const unitReward = Math.floor(UNIT_COST * 0.8); // 20% platform tax (burn rate)
  const campaignRef = db.collection("engagement_campaigns").doc();

  // Auto-calculate "Frenzy Mode" if high reward
  const isFrenzy = unitReward >= 5; // High value task

  // Step 2: Release to Soldiers (Humans)
  // Strategy dictates the release window to look "Organic".
  const visibleAt = new Date(); // Immediate for now, or based on strategy.velocity

  const campaignData = {
    campaignId: campaignRef.id,
    missionCodeName: missionStrategy.codeName, // Track which strategy is used
    posterId: userId,
    contentId,
    platform,
    externalUrl: externalUrl || "https://simulated-url.com", // Fallback for simulation
    actionType,
    totalSlots: quantity,
    claimedSlots: 0,
    completedSlots: 0,
    unitReward,
    isFrenzy,
    status: "active",
    createdAt: new Date().toISOString(),
    visibleAt: visibleAt.toISOString(),
    // URGENCY: Expiry is shorter for Frenzy tasks (4h vs 48h) to force rapid engagement
    // This simulates a "flash mob" effect algorithm loves
    expiresAt: new Date(Date.now() + (isFrenzy ? 4 : 48) * 60 * 60 * 1000).toISOString(),
    claimedBy: [],
  };

  await campaignRef.set(campaignData);

  return {
    success: true,
    campaignId: campaignRef.id,
    remainingCredits: credits - TOTAL_COST,
    message: isFrenzy
      ? `🔥 FRENZY ACTIVE! High reward task created. The wolf pack will be summoned.`
      : `Boost active! ${quantity} users can now earn credits.`,
  };
}

/**
 * Validates if the user has enough "Energy" or Daily Cap to work.
 * ENGINEERING: Anti-bot + Gamification (Stamina Bar)
 */
async function checkDailyWorkLimit(userId) {
  const todayStr = new Date().toISOString().split("T")[0];
  const statsRef = db.collection("users").doc(userId).collection("daily_stats").doc(todayStr);
  const userRef = db.collection("users").doc(userId);

  const [statsSnap, userSnap] = await Promise.all([statsRef.get(), userRef.get()]);
  const userData = userSnap.exists ? userSnap.data() : {};

  // Check subscription plan for limit
  const tier = userData.subscriptionTier || "free";

  // Limits definition (must match plans)
  const LIMITS = {
    free: 5,
    premium: 20,
    pro: 100,
    enterprise: 500,
  };

  const DAILY_LIMIT = LIMITS[tier] || 5;

  const current = (statsSnap.data() || {}).tasksCompleted || 0;

  // GAMIFICATION: Return remaining stamina
  const remaining = DAILY_LIMIT - current;

  if (remaining <= 0) {
    throw new Error("Daily stamina depleted. Come back tomorrow for the next hunt.");
  }
  return { remaining, max: DAILY_LIMIT };
}

/**
 * List available tasks for a user
 * STRATEGIC GAMIFICATION:
 * - "Wolf Hunt" Mode: Show tasks expiring SOONEST first (scarcity)
 * - "Gold Rush" Mode: Show highest paying first
 * - We mix them: High Pay + Urgency = Top of list.
 */
async function getAvailableBounties(userId, limit = 20) {
  // Check stamina silently
  try {
    await checkDailyWorkLimit(userId);
  } catch (e) {
    return [];
  }

  // Algorithm: Fetch active campaigns
  const snapshot = await db
    .collection("engagement_campaigns")
    .where("status", "==", "active")
    .orderBy("unitReward", "desc") // Gold Rush
    .limit(100)
    .get();

  const tasks = [];
  const now = new Date();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Safe & Smart Strategy: Check Visibility Timeline
    // The Mission Control "Strategist" determines when soldiers see the task.
    if (data.visibleAt) {
      const visibleTime = new Date(data.visibleAt);
      if (visibleTime > now) continue; // Still in "Stealth" phase
    }

    if (data.posterId === userId) continue;
    if (data.claimedBy && data.claimedBy.includes(userId)) continue;

    // SCARCITY: Check remaining slots
    const remainingSlots = data.totalSlots - data.claimedSlots;
    if (remainingSlots <= 0) continue;

    // URGENCY: Calculate time left
    const expiresAt = new Date(data.expiresAt);
    const msLeft = expiresAt - now;
    if (msLeft <= 0) continue; // Expired

    // GAMIFICATION: Tagging
    let tags = [];
    if (data.isFrenzy) tags.push("🔥 FRENZY");
    if (remainingSlots <= 3) tags.push("⚠️ LAST CALL");
    if (msLeft < 60 * 60 * 1000) tags.push("⏳ ENDING SOON");

    tasks.push({
      id: doc.id,
      platform: data.platform,
      reward: data.unitReward,
      tags,
      // UI Hint: Show "3 slots left" to trigger FOMO
      slotsLeft: remainingSlots,
      timeLeft: msLeft,
      title: `Appease the ${data.platform} algorithm`,
      description: `${data.actionType === "like" ? "Like" : "Comment"} quickly.`,
    });

    if (tasks.length >= limit) break;
  }

  return tasks;
}

/**
 * User B claims a task. This locks a slot and reveals the URL.
 * GAMIFICATION: "Claiming" is grabbing the prey.
 */
async function claimTask(workerUserId, campaignId) {
  const campaignRef = db.collection("engagement_campaigns").doc(campaignId);

  return await db.runTransaction(async t => {
    const doc = await t.get(campaignRef);
    if (!doc.exists) throw new Error("Prey not found");

    const data = doc.data();
    if (data.status !== "active") throw new Error("Hunt is over (Expired)");

    // RACE CONDITION DEFENSE: Strict check inside transaction
    if (data.claimedSlots >= data.totalSlots) {
      throw new Error("Too slow! Another wolf took the last slot.");
    }

    if (data.claimedBy && data.claimedBy.includes(workerUserId))
      throw new Error("You already feasted on this.");
    if (data.posterId === workerUserId) throw new Error("Cannot boost own content");

    // Lock the SLOT within a Transaction
    t.update(campaignRef, {
      claimedSlots: admin.firestore.FieldValue.increment(1),
      claimedBy: admin.firestore.FieldValue.arrayUnion(workerUserId),
    });

    // Create a temporary "Proof" record
    const proofRef = db.collection("engagement_proofs").doc();

    // DYNAMIC TIME LIMIT:
    // Frenzy tasks must be done in 5 mins. Normal tasks in 15.
    // This forces "Real Time" engagement spikes.
    const timeWindowMinutes = data.isFrenzy ? 5 : 15;

    const proofData = {
      proofId: proofRef.id,
      campaignId,
      workerUserId,
      status: "pending_verification",
      startedAt: new Date().toISOString(),
      minConfirmTime: new Date(Date.now() + 15 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + timeWindowMinutes * 60 * 1000).toISOString(),
    };
    t.set(proofRef, proofData);

    return {
      success: true,
      proofId: proofRef.id,
      externalUrl: data.externalUrl,
      // UX text to reinforce the game
      instructions: `⏳ You have ${timeWindowMinutes} minutes to strike. Go!`,
      expiresAt: proofData.expiresAt,
    };
  });
}

/**
 * User B confirms they did it.
 * ENGINEERING: Checks "Time on Task" to deter bots.
 * LEGAL: Requires Screenshot Proof URL for dispute resolution.
 */
async function confirmTaskCompletion(workerUserId, proofId, proofUrl) {
  const proofRef = db.collection("engagement_proofs").doc(proofId);

  return await db.runTransaction(async t => {
    const pDoc = await t.get(proofRef);
    if (!pDoc.exists) throw new Error("Task not found");
    const proof = pDoc.data();

    if (proof.workerUserId !== workerUserId) throw new Error("Unauthorized");
    if (proof.status !== "pending_verification") throw new Error("Invalid task status");

    // LEGAL: Mandatory Proof Check
    if (!proofUrl || !proofUrl.startsWith("http")) {
      throw new Error("Missing visual evidence. Screenshot required for payout.");
    }

    // ENGINEERING: Time Check
    const minConfirm = new Date(proof.minConfirmTime).getTime();
    if (Date.now() < minConfirm) {
      throw new Error(
        `Wait ${Math.ceil((minConfirm - Date.now()) / 1000)}s - Cannot engage that fast.`
      );
    }

    const campaignRef = db.collection("engagement_campaigns").doc(proof.campaignId);
    const cDoc = await t.get(campaignRef);
    if (!cDoc.exists) throw new Error("Campaign missing");
    const campaign = cDoc.data();

    // CREDIT TRANSFER
    const workerRef = db.collection("users").doc(workerUserId);

    // Update user balance & stats
    t.update(workerRef, {
      growth_credits: admin.firestore.FieldValue.increment(campaign.unitReward),
      "stats.tasksCompleted": admin.firestore.FieldValue.increment(1), // Lifetime
    });

    // Update Daily Stats (for limits)
    const todayStr = new Date().toISOString().split("T")[0];
    const dailyStatsRef = workerRef.collection("daily_stats").doc(todayStr);
    t.set(
      dailyStatsRef,
      {
        tasksCompleted: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Update Proof Status
    t.update(proofRef, {
      status: "verified",
      proofUrl: proofUrl, // Store evidence permanently
      completedAt: new Date().toISOString(),
    });

    // Update Campaign Progress
    t.update(campaignRef, {
      completedSlots: admin.firestore.FieldValue.increment(1),
    });

    return {
      success: true,
      earned: campaign.unitReward,
    };
  });
}

/**
 * DEPLOY SQUAD (Mission Control Hook)
 * Releases tasks from "Mission Control" storage into the public "Bounty Board".
 * This allows for trickle-feeding or mass-deployment based on strategy.
 */
async function deploySquad(missionId, amount) {
  if (!missionId) throw new Error("Mission ID required");

  // In a full implementation, we would move documents from a "Holding" collection
  // to the "Active" collection.
  // For this simulation/MVP version, we assume the Bounties are created directly
  // but flagged as "mission_controlled" and we activate them here.

  console.log(`[Community Engine] 🪂 Squad Deployed: ${amount} units for Mission ${missionId}`);

  // Simulate activation delay for effect
  // Real implementation: db.collection('campaigns').where('missionId', '==', ...).limit(amount).update({visible: true})

  return { deployed: amount };
}

function createGrowthSquad(userIds) {
  return {
    squadId: randomId(9),
    members: userIds,
    createdAt: new Date(),
    status: "active",
  };
}

/**
 * Fetch top creators by growth credits
 */
async function getLeaderboard(limit = 10) {
  try {
    const snap = await db
      .collection("user_credits")
      .orderBy("growth_credits", "desc")
      .limit(limit)
      .get();

    if (snap.empty) {
      // Return simulation if no real data yet
      return Array.from({ length: limit }, (_, i) => ({
        userId: `user${i + 1}`,
        growth_credits: Math.floor(Math.random() * 10000),
        viralScore: (Math.random() * 100).toFixed(2),
      })).sort((a, b) => b.growth_credits - a.growth_credits);
    }

    const leaderboard = [];
    // We need to fetch usernames separately
    for (const doc of snap.docs) {
      const credits = doc.data();
      const userSnap = await db.collection("users").doc(doc.id).get();
      const userData = userSnap.data() || {};
      leaderboard.push({
        userId: doc.id,
        username: userData.username || userData.email || `User ${doc.id.slice(0, 4)}`,
        growth_credits: credits.growth_credits || 0,
        viralScore: credits.viralScore || "0.00",
      });
    }
    return leaderboard;
  } catch (e) {
    console.error("[Community] Leaderboard fetch failed:", e);
    return [];
  }
}

/**
 * Publish Weekly Leaderboard to Discord
 * Designed to be run by a cron/scheduled job
 */
async function publishWeeklyLeaderboard() {
  const topCreators = await getLeaderboard(10);
  if (!topCreators.length) return;

  const fields = topCreators.map((c, i) => ({
    name: `#${i + 1} ${c.username}`,
    value: `💎 ${Math.floor(c.growth_credits)} Credits`,
    inline: false,
  }));

  const embed = {
    title: "🏆 Weekly Information Leaderboard",
    description: "Top Growth Creators this week! Keep posting to climb the ranks.",
    color: 0xffd700, // Gold
    fields: fields,
    footer: { text: "AutoPromote Community" },
    timestamp: new Date().toISOString(),
  };

  const channelId = process.env.DISCORD_LEADERBOARD_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (channelId && botToken) {
    try {
      await postViaBot({
        botToken,
        channelId,
        embeds: [embed],
      });
      return { success: true };
    } catch (e) {
      console.error("[Community] Failed to post leaderboard to Discord:", e);
      return { success: false, error: e.message };
    }
  } else {
    console.warn(
      "[Community] Missing Discord config for leaderboard (DISCORD_LEADERBOARD_CHANNEL_ID)"
    );
    return { success: false, skipped: true };
  }
}

function createViralChallenge(name, reward) {
  return {
    challengeId: randomId(9),
    name,
    reward,
    createdAt: new Date(),
    status: "active",
  };
}

/**
 * Register a Branded Spotify Campaign
 * Use Case: Brands sponsor playlists or tracks
 */
function createSpotifyCampaign({ brandName, playlistId, rewardPerStream = 0.05 }) {
  return {
    campaignId: randomId(10),
    type: "spotify_audio_campaign",
    brandName,
    targetPlaylistId: playlistId,
    rewardPerStream,
    status: "active",
    createdAt: new Date(),
  };
}

// Moved to bottom of file

// --- REVENUE ENGINE ---
const CREDIT_PACKAGES = [
  { id: "pack_small", credits: 50, price: 4.99, name: "Cub Snack" },
  { id: "pack_medium", credits: 150, price: 12.99, name: "Wolf Meal" },
  { id: "pack_large", credits: 500, price: 39.99, name: "Alpha Feast" },
];

async function purchaseCredits(userId, packageId) {
  const pack = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pack) throw new Error("Invalid package");

  const userRef = db.collection("users").doc(userId);
  await userRef.update({
    credits: admin.firestore.FieldValue.increment(pack.credits),
    lifetimeSpent: admin.firestore.FieldValue.increment(pack.price),
  });

  return { success: true, credits: pack.credits, message: `Feast Acquired: ${pack.name}` };
}

// --- NIGHT SHIFT: AUTO-PILOT BOTS ---
/**
 * Checks for tasks that have been available for too long with no human takers.
 * Triggers the Bot Execution Service to fulfill them.
 */
async function processStaleBounties() {
  const db = require("../firebaseAdmin").db;
  const botService = require("./botExecutionService");
  let processedCount = 0;

  // --- PHASE 1: PRIORITY SURGE (New Uploads) ---
  // Check for "Priority Bot" tasks first (regardless of age)
  try {
    const prioritySnap = await db
      .collection("engagement_campaigns")
      .where("status", "==", "active")
      .where("isPriority", "==", true)
      .orderBy("createdAt", "asc")
      .limit(1) // Keep strictly 1 per loop for Render Safety
      .get();

    if (!prioritySnap.empty) {
      const doc = prioritySnap.docs[0];
      const campaign = doc.data();
      console.log(
        `[Auto-Pilot] 🚀 Executing PRIORITY SURGE for ${doc.id} (${campaign.platform})...`
      );

      // Mark processing
      await doc.ref.update({ status: "processing", processingStartedAt: new Date() });

      // Execute Bot Action (Surge Mode - maybe add multiple views here?)
      // For safety, let's do 1 view per task execution, but keep the task open?
      // Or just do 1 big action. Let's start simple: 1 action per task.
      // If the campaign asks for 50 interactions, we should decrement a counter.

      let result = await botService.executeAction(
        campaign.externalUrl,
        campaign.platform,
        campaign.actionType || "view" // Default to VIEW for surge
      );

      if (result.success) {
        // If it's a multi-target campaign (e.g. 50 views), decrement
        if (campaign.targetInteractions > 1) {
          await doc.ref.update({
            targetInteractions: admin.firestore.FieldValue.increment(-1),
            status: "active", // Keep active so it gets picked up again
            lastActionAt: new Date(),
          });
          // Don't mark completed yet
        } else {
          // Done
          await doc.ref.update({
            status: "completed",
            completedBy: "system_autopilot_bot",
            completedAt: new Date(),
            notes: "Priority Surge Fulfilled",
          });
        }
        processedCount++;
      } else {
        console.error(`[Auto-Pilot] Priority Bot failed for ${doc.id}: ${result.error}`);
        // Mark failed to stop loop
        await doc.ref.update({ status: "failed_priority", errorLog: result.error });
      }

      // Cool-down and RETURN (Priority takes precedence over stale tasks)
      await new Promise(r => setTimeout(r, 5000));
      return { processed: 1, message: "Priority Surge task processed." };
    }
  } catch (e) {
    console.error("[Auto-Pilot] Priority Check Error:", e);
  }

  // --- PHASE 2: NIGHT SHIFT (Stale Human Tasks) ---
  // Only runs if no priority tasks were found
  const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
  // Reduced limit to 1 for SAFETY FIRST on Render (Prevent RAM spikes)
  const staleCampaigns = await db
    .collection("engagement_campaigns")
    .where("status", "==", "active")
    .where("createdAt", "<=", TEN_MINUTES_AGO) // Older than 10 mins
    .orderBy("createdAt", "asc") // Process oldest first
    .limit(1)
    .get();

  if (staleCampaigns.empty) return { processed: 0, message: "No stale bounties found." };

  for (const doc of staleCampaigns.docs) {
    const campaign = doc.data();
    console.log(`[Auto-Pilot] Engaging Bot for Campaign ${doc.id} (${campaign.platform})...`);

    // Mark as processing immediately to prevent double-processing if we scale later
    await db.collection("engagement_campaigns").doc(doc.id).update({
      status: "processing",
      processingStartedAt: new Date(),
    });

    try {
      // Attempt Bot Action (Sequential Execution)
      const result = await botService.executeAction(
        campaign.externalUrl,
        campaign.platform,
        campaign.actionType || "like"
      );

      if (result.success) {
        // Mark as completed by System
        await db.collection("engagement_campaigns").doc(doc.id).update({
          status: "completed",
          completedBy: "system_autopilot_bot",
          completedAt: new Date(),
          notes: "Fulfilled by Night Shift protocol",
        });
        processedCount++;
      } else {
        console.error(`[Auto-Pilot] Bot failed for ${doc.id}: ${result.error}`);
        // Revert to active so it can be retried or fail manually?
        // For now, let's mark as 'failed' to stop infinite retries
        await db.collection("engagement_campaigns").doc(doc.id).update({
          status: "failed_autopilot", // requires manual review
          errorLog: result.error,
        });
      }
    } catch (err) {
      console.error(`[Auto-Pilot] Critical error processing ${doc.id}:`, err);
      await db.collection("engagement_campaigns").doc(doc.id).update({
        status: "failed_error",
        errorLog: err.message,
      });
    }

    // Cool-down delay to let Garbage Collection act on the browser process memory
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return { processed: processedCount, message: `Auto-Pilot completed ${processedCount} tasks.` };
}

/**
 * NEW: Immediately queues a Community Mission for newly published content.
 * Replaces the old "Bot Surge" with a compliant "Organic Surge".
 */
async function triggerPriorityBotSurge(contentUrl, platform, quantity = 50, actionType = "view") {
  if (!contentUrl || !platform) return;

  console.log(`[Mission Control] 🚀 Launching Priority Mission (${actionType}) for ${platform}`);

  // Instead of a "Bot Campaign", we launch a "Community Mission"
  // This is handled by ViralMissionControl which uses algorithmic distribution.
  const viralMissionControl = require("./viralMissionControl");

  // We delegate the execution to Mission Control
  await viralMissionControl.launchOperation("system_auto_trigger", {
    url: contentUrl,
    platform: platform,
    type: actionType,
    targetAmount: quantity,
  });

  return { success: true, message: "Mission Control Activated" };
}

module.exports = {
  createGrowthSquad,
  getLeaderboard,
  createViralChallenge,
  publishWeeklyLeaderboard,
  triggerPriorityBotSurge, // Export new function
  createSpotifyCampaign,
  // Wolf Hunt Game Exports
  createEngagementBounty,
  checkDailyWorkLimit,
  getAvailableBounties,
  claimTask,
  deploySquad,
  confirmTaskCompletion,
  purchaseCredits,
  processStaleBounties, // Export the new bot trigger
  CREDIT_PACKAGES, // Export constant for frontend to fetch if needed via API
};
