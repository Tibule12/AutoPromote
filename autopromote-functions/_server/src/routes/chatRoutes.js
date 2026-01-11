// chatRoutes.js
// API routes for AI chatbot

const express = require("express");
const router = express.Router();
const chatbotService = require("../services/chatbotService");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");

/**
 * GET /api/chat/health
 * Check if OpenAI chatbot is properly configured
 */
router.get("/health", (req, res) => {
  const isConfigured = !!process.env.OPENAI_API_KEY;

  res.json({
    status: isConfigured ? "operational" : "not_configured",
    configured: isConfigured,
    model: "gpt-4o",
    features: {
      multilingual: true,
      languages: 11,
      conversationHistory: true,
    },
    message: isConfigured
      ? "AI Chatbot is ready"
      : "AI Chatbot requires OPENAI_API_KEY environment variable",
  });
});

// Rate limiting for chat
const chatRateLimitMap = new Map();
function chatRateLimit(req, res, next) {
  const userId = req.userId || req.user?.uid;
  const now = Date.now();
  const userKey = `chat_${userId}`;

  const userLimits = chatRateLimitMap.get(userKey) || { count: 0, resetTime: now + 60000 };

  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + 60000;
  }

  if (userLimits.count >= 20) {
    // 20 messages per minute
    return res.status(429).json({ error: "Too many messages. Please slow down." });
  }

  userLimits.count++;
  chatRateLimitMap.set(userKey, userLimits);
  next();
}

/**
 * POST /api/chat/message
 * Send a message to the chatbot
 * Body: { conversationId, message }
 */
router.post("/message", authMiddleware, chatRateLimit, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    let { conversationId, message } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Sanitize message (prevent injection)
    message = message.trim().substring(0, 1000); // Max 1000 chars

    // If no conversationId, create new conversation
    if (!conversationId) {
      conversationId = await chatbotService.createConversation(userId);
    } else {
      // Verify user owns this conversation
      const convDoc = await db.collection("chat_conversations").doc(conversationId).get();
      if (!convDoc.exists || convDoc.data().userId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    // Get user context for better responses
    const userContext = await getUserContext(userId);

    // --- REVENUE PROTECTION: Check Daily Limits for Free Plans ---
    if (userContext.plan === "free" || !userContext.plan) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const usageRef = db.collection("chat_usage").doc(`${userId}_${today}`);
      const usageDoc = await usageRef.get();

      const dailyCount = usageDoc.exists ? usageDoc.data().count || 0 : 0;
      const FREE_LIMIT = 5;

      if (dailyCount >= FREE_LIMIT) {
        // Log attempt
        console.warn(`[Revenue Protection] User ${userId} hit free chat limit.`);

        return res.status(403).json({
          error: "Daily Limit Reached",
          message: `🔒 **Daily Limit Reached**\n\nYou have used your ${FREE_LIMIT} free messages for today. \n\n**Upgrade to Pro** for:\n✅ Unlimited AI Chat\n✅ Viral AI Clips\n✅ Priority Support`,
          isUpgradeTrigger: true,
        });
      }

      // Increment usage count
      await usageRef.set(
        {
          count: dailyCount + 1,
          lastUsed: new Date().toISOString(),
          plan: "free",
        },
        { merge: true }
      );
    }
    // -------------------------------------------------------------

    // Send message to chatbot
    const response = await chatbotService.sendMessage(userId, conversationId, message, userContext);

    res.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error("[ChatRoutes] Send message error:", error);
    res.status(500).json({
      error: error.message || "Failed to send message",
      fallback: "I'm having trouble responding right now. Please try again in a moment.",
    });
  }
});

/**
 * POST /api/chat/conversation
 * Create a new conversation
 * Body: { initialMessage } (optional)
 */
router.post("/conversation", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { initialMessage } = req.body;

    const conversationId = await chatbotService.createConversation(userId, initialMessage);

    res.json({
      success: true,
      conversationId,
    });
  } catch (error) {
    console.error("[ChatRoutes] Create conversation error:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

/**
 * GET /api/chat/conversations
 * Get user's conversation list
 */
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const limit = parseInt(req.query.limit) || 10;

    const conversations = await chatbotService.getUserConversations(userId, limit);

    res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("[ChatRoutes] Get conversations error:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

/**
 * GET /api/chat/conversation/:conversationId
 * Get conversation history
 */
router.get("/conversation/:conversationId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { conversationId } = req.params;

    // Verify ownership
    const convDoc = await db.collection("chat_conversations").doc(conversationId).get();
    if (!convDoc.exists) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (convDoc.data().userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get messages
    const messages = await chatbotService.getConversationHistory(conversationId, 100);

    res.json({
      success: true,
      conversation: {
        id: conversationId,
        ...convDoc.data(),
      },
      messages,
    });
  } catch (error) {
    console.error("[ChatRoutes] Get conversation error:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

/**
 * DELETE /api/chat/conversation/:conversationId
 * Delete a conversation
 */
router.delete("/conversation/:conversationId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { conversationId } = req.params;

    await chatbotService.deleteConversation(conversationId, userId);

    res.json({
      success: true,
      message: "Conversation deleted",
    });
  } catch (error) {
    console.error("[ChatRoutes] Delete conversation error:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

/**
 * GET /api/chat/suggestions
 * Get suggested prompts based on user context
 */
router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    const userContext = await getUserContext(userId);
    const suggestions = chatbotService.getSuggestedPrompts(userContext);

    res.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("[ChatRoutes] Get suggestions error:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * Helper: Get user context for better chatbot responses
 */
async function getUserContext(userId) {
  try {
    const context = {
      plan: "free",
      connectedPlatforms: [],
      contentCount: 0,
      hasVideos: false,
      hasUsedAIClips: false,
      hasAIClips: false,
      earnings: { total: 0, pending: 0, paidOut: 0 },
      referrals: { total: 0, balance: 0, level1Progress: 0, level2Progress: 0 },
      notifications: { unread: 0, recent: [] },
    };

    // 1. Get User Profile & Earnings
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      context.plan = userData.plan || "free";

      // Earnings data
      context.earnings.total = userData.totalEarnings || 0;
      context.earnings.pending = userData.pendingEarnings || 0;
      // Derived
      context.earnings.paidOut = (userData.totalEarnings || 0) - (userData.pendingEarnings || 0);

      // Connected Platforms (Expanded list)
      const platforms = [
        "tiktok",
        "instagram",
        "youtube",
        "facebook",
        "twitter",
        "linkedin",
        "spotify",
        "pinterest",
        "reddit",
        "discord",
        "snapchat",
        "telegram",
      ];
      // NOTE: fetching all these one-by-one is slow. ideally cache or store in user doc.
      // Optimization: Check connections collection or user.connections field if exists.
      // For now, sticking to logic but limiting concurrency if needed or assuming critical ones.
      // Better way:
      const platformChecks = await Promise.all(
        platforms.map(p => db.collection(`${p}_connections`).doc(userId).get())
      );
      context.connectedPlatforms = platformChecks
        .map((doc, idx) => (doc.exists ? platforms[idx] : null))
        .filter(p => p !== null);
    }

    // 2. Get Referrals (Growth/Ambassador Status)
    const creditsDoc = await db.collection("user_credits").doc(userId).get();
    if (creditsDoc.exists) {
      const cData = creditsDoc.data();
      context.referrals.total = cData.totalReferrals || 0;
      context.referrals.balance = cData.balance || 0;

      // Progress tracking
      // Level 1: 10 Paid (Need to fetch paid count effectively, or just estimate)
      // For Chat context, total referrals is a good proxy for traffic at least.
      context.referrals.level1Progress = Math.min(context.referrals.total, 10);
      context.referrals.level2Progress = Math.min(context.referrals.total, 20);
    }

    // 3. Get Notifications (Urgency check)
    const notifSnap = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .where("read", "==", false)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    context.notifications.unread = notifSnap.size; // This is size of query limit (max 3)
    // To get real count we'd need count() aggregation, but 3 is enough for "You have unread alerts"
    context.notifications.recent = notifSnap.docs.map(d => d.data().title);

    // 4. Content Stats
    const contentSnapshot = await db
      .collection("content")
      .where("userId", "==", userId)
      .count() // Use count aggregation for speed/cost
      .get();
    context.contentCount = contentSnapshot.data().count;

    // Check basic permissions
    context.hasAIClips = context.plan === "pro" || context.plan === "enterprise";

    return context;
  } catch (error) {
    console.error("[ChatRoutes] Error getting user context:", error);
    return {};
  }
}

module.exports = router;
