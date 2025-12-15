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
    const context = {};

    // Get user document
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      context.plan = userData.plan || "free";
      context.connectedPlatforms = [];

      // Check connected platforms
      const platforms = ["tiktok", "instagram", "youtube", "facebook", "twitter"];
      for (const platform of platforms) {
        const connDoc = await db.collection(`${platform}_connections`).doc(userId).get();
        if (connDoc.exists) {
          context.connectedPlatforms.push(platform);
        }
      }
    }

    // Get content count
    const contentSnapshot = await db
      .collection("content")
      .where("userId", "==", userId)
      .limit(1)
      .get();
    context.contentCount = contentSnapshot.size;
    context.hasVideos = contentSnapshot.docs.some(doc => doc.data().type === "video");

    // Check if user has used AI clips
    const clipsSnapshot = await db
      .collection("clip_analyses")
      .where("userId", "==", userId)
      .limit(1)
      .get();
    context.hasUsedAIClips = !clipsSnapshot.empty;
    context.hasAIClips = context.plan === "pro" || context.plan === "enterprise";

    return context;
  } catch (error) {
    console.error("[ChatRoutes] Error getting user context:", error);
    return {};
  }
}

module.exports = router;
