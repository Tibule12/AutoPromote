const express = require("express");
const router = express.Router();
const Joi = require("joi");
const { admin, db } = require("../firebaseAdmin");

// Production safety guard: only enable when ASSISTANT_ENABLED=true
const ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED === "true";

// Simple input schema
const querySchema = Joi.object({
  prompt: Joi.string().max(1000).allow("").required(),
  context: Joi.object().optional(),
}).required();

// Lightweight assistant endpoint (scaffold)
// This endpoint accepts { prompt?: string, context?: object } and returns
// a JSON object { reply: string, actions?: [] }.
// Security: must be mounted behind auth middleware and gated by ASSISTANT_ENABLED.

router.post("/query", async (req, res) => {
  try {
    if (!ASSISTANT_ENABLED) return res.status(404).json({ error: "Not available" });

    const { error, value } = querySchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: "invalid_input", details: error.message });

    const { prompt = "", context = {} } = value;

    // Basic safety: redact obvious PII-like fields before any processing/logging
    const safeContext = JSON.parse(JSON.stringify(context || {}));
    try {
      if (safeContext?.user?.email) safeContext.user.email = "[REDACTED]";
    } catch (_) {}
    try {
      if (safeContext?.user?.phone) safeContext.user.phone = "[REDACTED]";
    } catch (_) {}
    try {
      if (safeContext?.platformSummary && safeContext.platformSummary.platforms)
        delete safeContext.platformSummary.platforms;
    } catch (_) {}

    // Identify user for basic per-user rate limiting (route mounted with auth middleware)
    const uid =
      req.userId ||
      (req.user && req.user.uid) ||
      (safeContext.user && safeContext.user.id) ||
      "anonymous";

    // Simple in-memory per-user rate limiter (safe default for scaffold)
    const RATE_LIMIT_PER_MIN = parseInt(process.env.ASSISTANT_RATE_LIMIT_PER_MIN || "60", 10);
    if (!global.__assistantRate) global.__assistantRate = new Map();
    const now = Date.now();
    const windowMs = 60 * 1000;
    const entry = global.__assistantRate.get(uid) || { count: 0, windowStart: now };
    if (now - entry.windowStart > windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }
    entry.count = (entry.count || 0) + 1;
    global.__assistantRate.set(uid, entry);
    if (entry.count > RATE_LIMIT_PER_MIN) {
      return res
        .status(429)
        .json({ error: "rate_limited", message: "Assistant rate limit exceeded" });
    }

    // If OpenAI provider configured, call it; otherwise fallback to canned replies
    const provider =
      process.env.ASSISTANT_PROVIDER || process.env.ASSISTANT_OPENAI_API_KEY ? "openai" : "builtin";
    if (provider === "openai" && process.env.ASSISTANT_OPENAI_API_KEY) {
      try {
        const OPENAI_KEY = process.env.ASSISTANT_OPENAI_API_KEY;
        const OPENAI_BASE = process.env.ASSISTANT_OPENAI_API_BASE || "https://api.openai.com";
        const MODEL =
          process.env.ASSISTANT_OPENAI_MODEL ||
          process.env.ASSISTANT_OPENAI_MODEL_NAME ||
          "gpt-4o-mini";
        const MAX_TOKENS = parseInt(process.env.ASSISTANT_MAX_TOKENS || "512", 10);
        const TEMP = parseFloat(process.env.ASSISTANT_TEMPERATURE || "0.2");

        // Build a minimal system prompt that constrains behavior and prevents asking for secrets
        const systemPrompt = `You are AutoPromote assistant. Provide concise, actionable help about the dashboard (uploads, connections, scheduling, community). Do not ask for or include PII, secrets, or API keys. Keep answers short and provide clear next steps.`;

        // Provide a short sanitized context to help with accuracy
        const contextSummary = JSON.stringify({
          user: safeContext.user
            ? { id: safeContext.user.id || safeContext.user.uid || null }
            : null,
          topicHints: safeContext.topicHints || null,
        }).slice(0, 1000);

        const messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Context: ${contextSummary}\n\nQuestion: ${String(prompt).slice(0, 2000)}`,
          },
        ];

        const endpoint = `${OPENAI_BASE.replace(/\/$/, "")}/v1/chat/completions`;
        const payload = { model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: TEMP };

        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify(payload),
          timeout: 20000,
        });
        if (!r.ok) {
          console.warn("[assistant] OpenAI responded with", r.status);
          // fallback to canned
        } else {
          const jr = await r.json().catch(() => null);
          const reply =
            jr &&
            jr.choices &&
            jr.choices[0] &&
            (jr.choices[0].message?.content || jr.choices[0].text)
              ? jr.choices[0].message?.content || jr.choices[0].text
              : null;
          if (reply) {
            // Audit log (fire-and-forget) - store minimal metadata only
            try {
              const intent = (function (q) {
                if (!q) return "empty";
                if (q.includes("upload") || q.includes("preview") || q.includes("failed"))
                  return "upload_issue";
                if (q.includes("connect") || q.includes("disconnect") || q.includes("reconnect"))
                  return "connection_issue";
                if (q.includes("pending") || q.includes("approval")) return "approval_question";
                if (q.includes("duplicate")) return "duplicate_issue";
                return "general";
              })(String(prompt).toLowerCase());
              const rec = {
                uid: uid || null,
                provider: "openai",
                provider_status: "ok",
                intent,
                requestId: req.correlationId || req.headers["x-request-id"] || null,
              };
              db.collection("assistant_actions")
                .add({ ...rec, createdAt: admin.firestore.FieldValue.serverTimestamp() })
                .catch(() => {});
            } catch (_) {}
            return res.json({ reply: String(reply).trim(), actions: [] });
          }
        }
      } catch (openErr) {
        console.warn("[assistant] OpenAI call failed:", openErr && openErr.message);
        // continue to canned fallback
      }
    }

    // Builtin canned heuristic replies (fallback)
    const q = (prompt || "").toLowerCase();
    let reply = "";
    if (!q || q.trim().length === 0) {
      reply =
        "Hello — I can help explain dashboard items, troubleshoot uploads, guide platform connections, or suggest caption edits. Ask me anything or include an upload id for context.";
    } else if (q.includes("upload") || q.includes("preview") || q.includes("failed")) {
      reply =
        "Uploads usually fail when storage upload did not complete before the content POST. Use the Retry action; the system will reuse the idempotency key to avoid duplicates.";
    } else if (q.includes("connect") || q.includes("tiktok") || q.includes("connected")) {
      reply =
        "A disconnected platform typically means the access token expired or permissions changed. Click Reconnect to re-authorize; the assistant can open the auth flow for you.";
    } else if (q.includes("pending") || q.includes("approval")) {
      reply =
        'Pending approval means the content requires moderator review. Use the "Request review" action or message an admin with a short template.';
    } else if (q.includes("duplicate") || q.includes("duplicates")) {
      reply =
        "Duplicates are mitigated by idempotency keys; if you see duplicates, provide an upload id and I will check recent similar uploads.";
    } else {
      reply =
        "I can help with that — please provide a bit more context (upload id, platform name, or describe the action).";
    }

    // Audit log for fallback replies
    try {
      const intent = (function (q) {
        if (!q) return "empty";
        if (q.includes("upload") || q.includes("preview") || q.includes("failed"))
          return "upload_issue";
        if (q.includes("connect") || q.includes("disconnect") || q.includes("reconnect"))
          return "connection_issue";
        if (q.includes("pending") || q.includes("approval")) return "approval_question";
        if (q.includes("duplicate")) return "duplicate_issue";
        return "general";
      })(q);
      const rec = {
        uid: uid || null,
        provider: "builtin",
        provider_status: "fallback",
        intent,
        requestId: req.correlationId || req.headers["x-request-id"] || null,
      };
      db.collection("assistant_actions")
        .add({ ...rec, createdAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch(() => {});
    } catch (_) {}

    return res.json({ reply, actions: [] });
  } catch (err) {
    console.error("Assistant /query error", (err && err.stack) || err);
    return res.status(500).json({ error: "Assistant service error" });
  }
});

module.exports = router;
