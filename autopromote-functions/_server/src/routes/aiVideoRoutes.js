const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const {
  deductCredits,
  refundCredits,
  getCreditBreakdown,
  isLocalEditingCreditBypassEnabled,
} = require("../creditSystem");
const { chatCompletions } = require("../services/openaiClient");

const DEFAULT_REMOTE_MEDIA_WORKER_URL = "https://media-worker-v1-341498038874.us-central1.run.app";
const DEFAULT_LOCAL_MEDIA_WORKER_URL = "http://127.0.0.1:8000";
const explicitMediaWorkerUrl = Boolean(process.env.MEDIA_WORKER_URL);
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL ||
  (process.env.NODE_ENV === "production"
    ? DEFAULT_REMOTE_MEDIA_WORKER_URL
    : DEFAULT_LOCAL_MEDIA_WORKER_URL);
const LOCAL_MEDIA_WORKER_URL = process.env.LOCAL_MEDIA_WORKER_URL || DEFAULT_LOCAL_MEDIA_WORKER_URL;

const FALLBACK_STOCK_VIDEO =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const IDEA_VIDEO_PREVIEW_OPERATION = "idea-video-preview";
const IDEA_VIDEO_RENDER_OPERATION = "idea-video-render";
const IDEA_VIDEO_PREVIEW_CREDITS = Math.max(
  1,
  Number(process.env.IDEA_VIDEO_PREVIEW_CREDITS || 5) || 5
);
const IDEA_VIDEO_RENDER_BASE_CREDITS = Math.max(
  1,
  Number(process.env.IDEA_VIDEO_RENDER_BASE_CREDITS || 25) || 25
);
const IDEA_VIDEO_RENDER_CREDITS_PER_SCENE = Math.max(
  1,
  Number(process.env.IDEA_VIDEO_RENDER_CREDITS_PER_SCENE || 8) || 8
);
const IDEA_VIDEO_PREVIEW_SCENE_LIMIT = Math.max(
  1,
  Number(process.env.IDEA_VIDEO_PREVIEW_SCENE_LIMIT || 1) || 1
);

async function findStockVideo(query) {
  if (!process.env.PEXELS_API_KEY) {
    console.warn("PEXELS_API_KEY missing. Using fallback video.");
    return FALLBACK_STOCK_VIDEO;
  }

  try {
    const { data } = await axios.get("https://api.pexels.com/videos/search", {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: {
        query: query || "creator filming content",
        per_page: 1,
        orientation: "portrait",
      },
      timeout: 10000,
    });
    const video = data.videos?.[0];
    const file =
      video?.video_files?.find(item => item.height >= 720 && item.height <= 1920) ||
      video?.video_files?.[0];

    return file?.link || FALLBACK_STOCK_VIDEO;
  } catch (e) {
    console.error("Pexels error:", e.message);
    return FALLBACK_STOCK_VIDEO;
  }
}

function getMediaWorkerUrls() {
  const urls = [];
  const addUrl = url => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  if (explicitMediaWorkerUrl) {
    addUrl(MEDIA_WORKER_URL);
    addUrl(LOCAL_MEDIA_WORKER_URL);
    return urls;
  }

  if (process.env.NODE_ENV === "production") {
    addUrl(MEDIA_WORKER_URL);
    addUrl(LOCAL_MEDIA_WORKER_URL);
  } else {
    addUrl(LOCAL_MEDIA_WORKER_URL);
    addUrl(DEFAULT_REMOTE_MEDIA_WORKER_URL);
  }

  return urls;
}

function stripJsonFence(value = "") {
  return String(value)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonPayload(value = "") {
  const stripped = stripJsonFence(value);
  try {
    return JSON.parse(stripped);
  } catch (_) {
    const firstObject = stripped.indexOf("{");
    const lastObject = stripped.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(stripped.slice(firstObject, lastObject + 1));
      } catch (_) {}
    }

    const firstArray = stripped.indexOf("[");
    const lastArray = stripped.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(stripped.slice(firstArray, lastArray + 1));
      } catch (_) {}
    }
  }

  return null;
}

function cleanSceneText(value = "") {
  return String(value)
    .replace(/^\s*(scene\s*)?\d+[\).:-]\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function normalizeScenes(payload, fallbackText = "") {
  const maxScenes = Number(payload?.targetSeconds || payload?.target_seconds || 0) >= 45 ? 8 : 6;
  const rawScenes = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.scripts)
      ? payload.scripts
      : Array.isArray(payload?.scenes)
        ? payload.scenes
        : [];

  const scenes = rawScenes
    .map((scene, index) => {
      const text = cleanSceneText(
        typeof scene === "string"
          ? scene
          : scene?.text || scene?.voiceover || scene?.line || scene?.script || ""
      );
      if (!text) return null;

      return {
        text,
        visual: cleanSceneText(scene?.visual || scene?.shot || scene?.broll || scene?.bRoll || ""),
        caption: cleanSceneText(scene?.caption || scene?.onScreenText || ""),
        searchQuery: cleanSceneText(
          scene?.searchQuery || scene?.visualSearch || scene?.assetQuery || ""
        ),
        duration: Number(scene?.duration || scene?.seconds) || (index === 0 ? 3 : 4),
      };
    })
    .filter(Boolean)
    .slice(0, maxScenes);

  if (scenes.length > 0) return scenes;

  return stripJsonFence(fallbackText)
    .split("\n")
    .map(cleanSceneText)
    .filter(line => line.length > 12)
    .slice(0, 5)
    .map((text, index) => ({
      text,
      visual: "",
      caption: "",
      searchQuery: "",
      duration: index === 0 ? 3 : 4,
    }));
}

function countWords(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getTargetWordRange(targetSeconds) {
  const seconds = Math.min(60, Math.max(15, Number(targetSeconds) || 30));
  const target = Math.round(seconds * 2.35);
  return {
    target,
    min: Math.round(target * 0.88),
    max: Math.round(target * 1.12),
  };
}

function getSceneWordCount(scenes = []) {
  return scenes.reduce(
    (total, scene) => total + countWords(scene?.text || scene?.voiceover || scene),
    0
  );
}

function scenesMatchTargetDuration(scenes = [], targetSeconds) {
  const range = getTargetWordRange(targetSeconds);
  const words = getSceneWordCount(scenes);
  return words >= range.min && words <= range.max;
}

function expandScenesToMinimumWords(scenes = [], targetSeconds, idea = "") {
  const range = getTargetWordRange(targetSeconds);
  const expanded = scenes.map(scene => ({ ...scene }));
  const subject = cleanSceneText(idea) || "this";
  const additions = [
    "That is the shift: make the next step smaller, easier to repeat, and clear enough to try today.",
    "Show the change with a real example, because the viewer needs to see the difference before they believe it.",
    "Keep the lesson simple: remove the pressure first, then let consistency create the confidence people are missing.",
    `Bring it back to ${subject} so the point feels practical, not like random advice floating on screen.`,
    "Give the viewer one specific action they can copy as soon as the video ends.",
  ];

  let guard = 0;
  while (
    expanded.length &&
    getSceneWordCount(expanded) < range.min &&
    guard < expanded.length * 4
  ) {
    const scene = expanded[guard % expanded.length];
    const addition = additions[guard % additions.length];
    scene.text = cleanSceneText(`${scene.text} ${addition}`);
    guard += 1;
  }

  return expanded;
}

function trimTextToWordLimit(text = "", maxWords) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return cleanSceneText(text);
  return cleanSceneText(
    words
      .slice(0, Math.max(1, maxWords))
      .join(" ")
      .replace(/[,.!?;:]*$/, ".")
  );
}

function trimScenesToMaximumWords(scenes = [], targetSeconds) {
  const range = getTargetWordRange(targetSeconds);
  const trimmed = scenes.map(scene => ({ ...scene }));
  let guard = 0;

  while (trimmed.length && getSceneWordCount(trimmed) > range.max && guard < trimmed.length * 4) {
    const overage = getSceneWordCount(trimmed) - range.max;
    let longestIndex = 0;
    let longestWords = 0;

    trimmed.forEach((scene, index) => {
      const words = countWords(scene.text);
      if (words > longestWords) {
        longestWords = words;
        longestIndex = index;
      }
    });

    if (longestWords <= 8) break;
    const removeCount = Math.min(overage, Math.max(1, longestWords - 8));
    trimmed[longestIndex].text = trimTextToWordLimit(
      trimmed[longestIndex].text,
      longestWords - removeCount
    );
    guard += 1;
  }

  return trimmed;
}

function buildFallbackScenes(idea) {
  const topic = cleanSceneText(idea) || "this idea";
  return [
    {
      text: `Start with the moment people already recognize: ${topic}.`,
      visual: "A tight opening shot that makes the topic instantly clear.",
      caption: "Start here",
      searchQuery: topic,
      duration: 3,
    },
    {
      text: "Show the specific problem, mistake, or surprising detail most people miss.",
      visual: "Close-up detail, quick comparison, or before-and-after visual.",
      caption: "Most people miss this",
      searchQuery: `${topic} detail`,
      duration: 4,
    },
    {
      text: "Give the useful payoff in plain language, like you are explaining it to a friend.",
      visual: "Hands-on demo, clear example, or simple visual proof.",
      caption: "The simple fix",
      searchQuery: `${topic} example`,
      duration: 5,
    },
    {
      text: "End with one memorable takeaway viewers can repeat or try immediately.",
      visual: "Clean final frame with the strongest result or takeaway.",
      caption: "Try this next",
      searchQuery: `${topic} result`,
      duration: 3,
    },
  ];
}

function normalizeRenderMode(value) {
  return String(value || "").toLowerCase() === "preview" ? "preview" : "full";
}

function getRenderOperation(renderMode) {
  return renderMode === "preview" ? IDEA_VIDEO_PREVIEW_OPERATION : IDEA_VIDEO_RENDER_OPERATION;
}

function estimateRenderCredits(sceneCount, renderMode) {
  if (renderMode === "preview") return IDEA_VIDEO_PREVIEW_CREDITS;
  const safeSceneCount = Math.max(1, Number(sceneCount || 0) || 1);
  return Math.max(
    IDEA_VIDEO_RENDER_BASE_CREDITS,
    safeSceneCount * IDEA_VIDEO_RENDER_CREDITS_PER_SCENE
  );
}

function getUserId(req) {
  return req.userId || req.user?.uid || null;
}

function normalizeRenderScenes(scenes, topic, renderMode) {
  const sceneItems = Array.isArray(scenes) ? scenes : [topic];
  const limitedItems =
    renderMode === "preview" ? sceneItems.slice(0, IDEA_VIDEO_PREVIEW_SCENE_LIMIT) : sceneItems;

  return limitedItems
    .map(item => {
      const text = cleanSceneText(typeof item === "string" ? item : item?.text);
      if (!text) return null;

      const searchQuery = cleanSceneText(
        typeof item === "string"
          ? topic
          : item?.searchQuery || item?.visual || item?.caption || topic || text
      );

      return {
        text,
        caption: cleanSceneText(typeof item === "string" ? "" : item?.caption || ""),
        searchQuery,
        duration: Number(typeof item === "string" ? 0 : item?.duration || item?.seconds) || null,
      };
    })
    .filter(Boolean);
}

function normalizeTargetDuration(value, renderMode) {
  const fallback = renderMode === "preview" ? 10 : 30;
  const duration = Number(value || fallback) || fallback;
  const minDuration = renderMode === "preview" ? 5 : 15;
  const maxDuration = renderMode === "preview" ? 15 : 90;
  return Math.min(maxDuration, Math.max(minDuration, duration));
}

async function chargeIdeaVideoCredits(userId, amount, renderMode, sceneCount) {
  const operation = getRenderOperation(renderMode);

  if (!userId) {
    return {
      success: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Please sign in before rendering video.",
    };
  }

  if (!isLocalEditingCreditBypassEnabled()) {
    const balance = await getCreditBreakdown(userId);
    if (balance.tier === "free") {
      return {
        success: false,
        status: 402,
        code: "UPGRADE_REQUIRED",
        required: amount,
        remaining: balance.totalAvailable,
        tier: balance.tier,
        message:
          "Drafting scenes is free. MP4 rendering uses paid creator credits because it runs the media worker.",
      };
    }

    if (balance.totalAvailable < amount) {
      return {
        success: false,
        status: 402,
        code: "INSUFFICIENT_CREDITS",
        required: amount,
        remaining: balance.totalAvailable,
        tier: balance.tier,
        message: `You need ${amount} credits to render this video. You have ${balance.totalAvailable}.`,
      };
    }
  }

  const charge = await deductCredits(userId, amount, operation);
  return {
    ...charge,
    status: charge.success ? 200 : 402,
    code: charge.success ? "CREDITS_CHARGED" : "INSUFFICIENT_CREDITS",
    required: amount,
    renderMode,
    sceneCount,
  };
}

async function refundIdeaVideoCredits(userId, charge, reason, metadata = {}) {
  if (!userId || !charge || charge.skipped || Number(charge.deducted || 0) <= 0) return null;
  return refundCredits(
    userId,
    charge,
    `${charge.operation || IDEA_VIDEO_RENDER_OPERATION}-refund`,
    {
      reason,
      ...metadata,
    }
  );
}

router.use(authMiddleware);

// --- NEW SCRIPT GENERATION ENDPOINT ---
router.post("/script", async (req, res) => {
  try {
    const {
      idea,
      language = "detect",
      style = "creator",
      platform = "short_form",
      targetSeconds = 30,
    } = req.body;
    if (!idea) return res.status(400).json({ error: "Idea is required" });

    const safeTargetSeconds = Math.min(60, Math.max(15, Number(targetSeconds) || 30));

    const wordRange = getTargetWordRange(safeTargetSeconds);
    const sceneCountGuidance =
      safeTargetSeconds >= 60
        ? "Create 7-8 scenes."
        : safeTargetSeconds >= 45
          ? "Create 6-7 scenes."
          : "Create 4-6 scenes.";

    const messages = [
      {
        role: "system",
        content: `You are a sharp short-form video writer for creator-led TikTok, Reels, and Shorts.
Write scripts that sound human, specific, and filmed by a real creator.

Rules:
- No generic lines like "Did you know", "Here is the truth", "This changes everything", or "Follow for more".
- No hype filler, no corporate marketing voice, no hashtags, no emoji, no AI references.
- Use plain spoken language with a strong first line, visual action, and a clear payoff.
- Make every scene filmable with stock footage or simple creator footage.
- The total voiceover must be ${wordRange.min}-${wordRange.max} words, aiming for ${wordRange.target} words.
- Scene durations must add up to ${safeTargetSeconds} seconds.
- Return only valid JSON.

JSON shape:
{
  "title": "short working title",
  "description": "one sentence positioning",
  "scripts": [
    {
      "text": "voiceover line",
      "visual": "what should be on screen",
      "caption": "short on-screen caption",
      "searchQuery": "stock footage search phrase",
      "duration": 3
    }
  ]
}`,
      },
      {
        role: "user",
        content: `Idea: ${idea}
Language: ${language}
Creative style: ${style}
Platform: ${platform}
Target length: ${safeTargetSeconds} seconds
Target voiceover words: ${wordRange.target} (${wordRange.min}-${wordRange.max} allowed)
${sceneCountGuidance} Make the first scene a pattern interrupt, not a question.`,
      },
    ];

    try {
      let response = await chatCompletions({
        model: process.env.AI_VIDEO_SCRIPT_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.85,
      });

      let content = response.choices[0].message.content;
      let payload = extractJsonPayload(content);
      let scenes = normalizeScenes(
        { ...(payload || {}), targetSeconds: safeTargetSeconds },
        content
      );

      let retryCount = 0;
      while (
        scenes.length > 0 &&
        !scenesMatchTargetDuration(scenes, safeTargetSeconds) &&
        retryCount < 2
      ) {
        const currentWords = getSceneWordCount(scenes);
        const averageWords = Math.max(
          10,
          Math.round(wordRange.target / Math.max(1, scenes.length))
        );
        response = await chatCompletions({
          model: process.env.AI_VIDEO_SCRIPT_MODEL || "gpt-4o-mini",
          messages: [
            ...messages,
            {
              role: "assistant",
              content,
            },
            {
              role: "user",
              content: `Rewrite this draft because it is ${currentWords} voiceover words. It must be ${wordRange.min}-${wordRange.max} words so the spoken script naturally fills ${safeTargetSeconds} seconds.
Every scene text must average about ${averageWords} spoken words. Do not write micro-scenes. Keep it specific, human, and return the same JSON shape only.`,
            },
          ],
          temperature: 0.82,
        });
        content = response.choices[0].message.content;
        payload = extractJsonPayload(content);
        scenes = normalizeScenes({ ...(payload || {}), targetSeconds: safeTargetSeconds }, content);
        retryCount += 1;
      }

      if (scenes.length > 0 && getSceneWordCount(scenes) < wordRange.min) {
        scenes = expandScenesToMinimumWords(scenes, safeTargetSeconds, idea);
      }
      if (scenes.length > 0 && getSceneWordCount(scenes) > wordRange.max) {
        scenes = trimScenesToMaximumWords(scenes, safeTargetSeconds);
      }

      if (scenes.length === 0) {
        throw new Error("AI returned no usable scenes");
      }

      res.json({
        success: true,
        title: cleanSceneText(payload?.title || idea),
        description: cleanSceneText(payload?.description || ""),
        scripts: scenes,
        targetSeconds: safeTargetSeconds,
        wordCount: getSceneWordCount(scenes),
        targetWordRange: wordRange,
      });
    } catch (aiError) {
      console.error("OpenAI Script Generation Error:", aiError);
      res.json({
        success: true,
        scripts: buildFallbackScenes(idea),
        warning: "AI unavailable, using creator-safe fallback.",
      });
    }
  } catch (error) {
    console.error("Script generation error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/generate", async (req, res) => {
  let creditCharge = null;
  const userId = getUserId(req);

  try {
    const { topic, scenes, voice, voiceRate, targetDuration } = req.body;
    const renderMode = normalizeRenderMode(req.body.renderMode || req.body.mode);
    const renderScenes = normalizeRenderScenes(scenes, topic, renderMode);
    const requestedTargetDuration = normalizeTargetDuration(targetDuration, renderMode);
    const creditCost = estimateRenderCredits(renderScenes.length, renderMode);

    console.log(
      `[IdeaVideo] Generating for topic: ${topic} (${renderScenes.length} ${renderMode} scenes)`
    );

    if (!renderScenes.length) {
      return res.status(400).json({ error: "At least one scene is required" });
    }

    creditCharge = await chargeIdeaVideoCredits(
      userId,
      creditCost,
      renderMode,
      renderScenes.length
    );

    if (!creditCharge.success) {
      return res.status(creditCharge.status || 402).json({
        error: creditCharge.message || "Not enough credits to render this video.",
        code: creditCharge.code || "INSUFFICIENT_CREDITS",
        requiredCredits: creditCharge.required || creditCost,
        remainingCredits: creditCharge.remaining ?? null,
        renderMode,
      });
    }

    const enrichedScenes = [];
    for (const item of renderScenes) {
      const videoUrl = await findStockVideo(item.searchQuery);

      enrichedScenes.push({
        text: item.text,
        caption: item.caption,
        video_url: videoUrl,
        keywords: item.searchQuery,
      });
    }

    let lastWorkerError = null;
    const workerUrls = getMediaWorkerUrls();

    for (const workerUrl of workerUrls) {
      try {
        const response = await axios({
          method: "post",
          url: `${workerUrl}/render-idea-video`,
          data: {
            scenes: enrichedScenes,
            music_file: "upbeat.mp3",
            voice: cleanSceneText(voice) || process.env.IDEA_VIDEO_VOICE || "en-US-AriaNeural",
            voice_rate: cleanSceneText(voiceRate) || process.env.IDEA_VIDEO_VOICE_RATE || "+8%",
            target_duration: requestedTargetDuration,
            aspect_ratio: "9:16",
            subtitles: true,
          },
          responseType: "stream",
          timeout: 600000,
        });

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", 'attachment; filename="generated_video.mp4"');
        res.setHeader(
          "Access-Control-Expose-Headers",
          "X-AutoPromote-Credits-Charged, X-AutoPromote-Credits-Remaining, X-AutoPromote-Render-Mode"
        );
        res.setHeader(
          "X-AutoPromote-Credits-Charged",
          String(creditCharge.deducted || creditCharge.billedAmount || creditCost)
        );
        if (creditCharge.remaining !== null && creditCharge.remaining !== undefined) {
          res.setHeader("X-AutoPromote-Credits-Remaining", String(creditCharge.remaining));
        }
        res.setHeader("X-AutoPromote-Render-Mode", renderMode);
        response.data.pipe(res);
        return;
      } catch (workerError) {
        lastWorkerError = workerError;
        console.error(
          `[AI Video] Python worker failed at ${workerUrl}:`,
          workerError.response?.status || workerError.message
        );
      }
    }

    if (!res.headersSent) {
      await refundIdeaVideoCredits(userId, creditCharge, "worker_unavailable", {
        renderMode,
        workerUrls,
      });
      return res.status(503).json({
        error: `Video generation is temporarily unavailable. Tried Python worker at ${workerUrls.join(
          ", "
        )}. Last error: ${lastWorkerError?.response?.status || lastWorkerError?.message || "unknown"}`,
        scripts: enrichedScenes.map(scene => scene.text),
      });
    }
  } catch (error) {
    console.error("Idea video generation failed:", error.message);
    if (!res.headersSent) {
      await refundIdeaVideoCredits(userId, creditCharge, "route_error", {
        message: error.message,
      });
      res.status(500).json({ error: "Generation failed: " + error.message });
    }
  }
});

module.exports = router;
