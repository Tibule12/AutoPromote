// communityEngine.js
// Historical squad/leaderboard helpers and Spotify campaign metadata.
// The retired engagement marketplace has no executable campaign/reward path.

const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const { postViaBot } = require("./discordService");

function randomId(len = 9) {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .substr(0, len);
}

// --- CORE ENGAGEMENT EXCHANGE LOGIC ---

function createGrowthSquad(userIds) {
  return {
    squadId: randomId(9),
    members: userIds,
    createdAt: new Date(),
    status: "active",
  };
}

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

function retiredEngagement() {
  return Promise.reject(Object.assign(new Error('This engagement marketplace has been retired.'), {
    code: 'FEATURE_RETIRED', statusCode: 410,
  }));
}

module.exports = {
  createGrowthSquad,
  getLeaderboard,
  createViralChallenge,
  publishWeeklyLeaderboard,
  triggerPriorityBotSurge: retiredEngagement,
  createSpotifyCampaign,
  // Retired engagement marketplace Game Exports
  createEngagementBounty: retiredEngagement,
  checkDailyWorkLimit: retiredEngagement,
  getAvailableBounties: retiredEngagement,
  claimTask: retiredEngagement,
  deploySquad: retiredEngagement,
  confirmTaskCompletion: retiredEngagement,
  purchaseCredits: retiredEngagement,
  processStaleBounties: retiredEngagement,
};
