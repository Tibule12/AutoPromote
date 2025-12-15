// openaiUsageLogger.js
// Lightweight logger to record OpenAI usage per user and feature in Firestore
const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");

async function logOpenAIUsage({ userId, feature, model, usage, promptSnippet }) {
  if (!process.env.OPENAI_LOGGING_ENABLED || process.env.OPENAI_LOGGING_ENABLED === "0") return;
  try {
    const doc = {
      userId: userId || null,
      feature: feature || "openai",
      model: model || null,
      usage: usage || {},
      promptSnippet: typeof promptSnippet === "string" ? promptSnippet.slice(0, 500) : undefined,
      createdAt: new Date().toISOString(),
    };
    await db.collection("openai_usage").add(doc);
  } catch (e) {
    try {
      logger.warn("[OpenAIUsage] failed to record usage", e && e.message);
    } catch (_) {}
  }
}

module.exports = { logOpenAIUsage };
