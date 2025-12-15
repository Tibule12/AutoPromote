// smartDistributionEngine.js
// AutoPromote Smart Distribution Engine
// Peak engagement time scheduling, trending content optimization, platform-specific formatting

const { db } = require("../firebaseAdmin");
const hashtagEngine = require("./hashtagEngine");

// Peak engagement times by platform (in UTC hours)
const PEAK_TIMES = {
  tiktok: {
    weekday: [
      { start: 11, end: 13, score: 0.9 }, // 11 AM - 1 PM
      { start: 19, end: 22, score: 1.0 }, // 7 PM - 10 PM (PEAK)
      { start: 15, end: 17, score: 0.85 }, // 3 PM - 5 PM
    ],
    weekend: [
      { start: 10, end: 12, score: 0.95 },
      { start: 14, end: 16, score: 0.9 },
      { start: 19, end: 23, score: 1.0 }, // PEAK
    ],
  },
  instagram: {
    weekday: [
      { start: 11, end: 13, score: 1.0 }, // 11 AM - 1 PM (PEAK)
      { start: 19, end: 21, score: 0.95 }, // 7 PM - 9 PM
      { start: 6, end: 9, score: 0.8 }, // 6 AM - 9 AM
    ],
    weekend: [
      { start: 9, end: 11, score: 0.9 },
      { start: 13, end: 15, score: 0.85 },
      { start: 19, end: 22, score: 1.0 }, // PEAK
    ],
  },
  youtube: {
    weekday: [
      { start: 15, end: 17, score: 1.0 }, // 3 PM - 5 PM (PEAK)
      { start: 12, end: 14, score: 0.9 }, // 12 PM - 2 PM
      { start: 20, end: 22, score: 0.95 }, // 8 PM - 10 PM
    ],
    weekend: [
      { start: 10, end: 12, score: 0.9 },
      { start: 14, end: 18, score: 1.0 }, // PEAK
      { start: 20, end: 23, score: 0.95 },
    ],
  },
  twitter: {
    weekday: [
      { start: 8, end: 10, score: 0.95 }, // 8 AM - 10 AM
      { start: 12, end: 13, score: 1.0 }, // 12 PM - 1 PM (PEAK)
      { start: 17, end: 18, score: 0.9 }, // 5 PM - 6 PM
    ],
    weekend: [
      { start: 9, end: 11, score: 0.85 },
      { start: 13, end: 15, score: 1.0 }, // PEAK
      { start: 19, end: 21, score: 0.9 },
    ],
  },
  facebook: {
    weekday: [
      { start: 9, end: 11, score: 0.95 }, // 9 AM - 11 AM
      { start: 13, end: 15, score: 1.0 }, // 1 PM - 3 PM (PEAK)
      { start: 19, end: 21, score: 0.9 }, // 7 PM - 9 PM
    ],
    weekend: [
      { start: 12, end: 14, score: 1.0 }, // PEAK
      { start: 19, end: 22, score: 0.95 },
    ],
  },
};

// Platform-specific content formatting rules
const PLATFORM_FORMATTING = {
  tiktok: {
    captionMaxLength: 2200,
    hashtagLimit: 30,
    videoLengthRecommended: { min: 15, max: 60, optimal: 21 },
    hookDuration: 3, // seconds
    soundRequired: true,
    aspectRatio: "9:16",
    features: ["duet", "stitch", "effects"],
  },
  instagram: {
    captionMaxLength: 2200,
    hashtagLimit: 30,
    videoLengthRecommended: { min: 15, max: 90, optimal: 30 },
    hookDuration: 3,
    aspectRatio: ["1:1", "4:5", "9:16"],
    features: ["reels", "stories", "carousel"],
  },
  youtube: {
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
    tagsLimit: 500,
    videoLengthRecommended: { min: 60, max: 600, optimal: 180 },
    hookDuration: 8,
    aspectRatio: "16:9",
    features: ["shorts", "chapters", "endscreen"],
  },
  twitter: {
    captionMaxLength: 280,
    hashtagLimit: 2,
    videoLengthRecommended: { min: 5, max: 140, optimal: 45 },
    hookDuration: 2,
    aspectRatio: ["16:9", "1:1"],
    features: ["thread", "poll", "quote"],
  },
  facebook: {
    captionMaxLength: 63206,
    hashtagLimit: 10,
    videoLengthRecommended: { min: 15, max: 240, optimal: 60 },
    hookDuration: 3,
    aspectRatio: ["16:9", "1:1", "9:16"],
    features: ["stories", "watch", "live"],
  },
};

// Caption structure templates by platform
const CAPTION_TEMPLATES = {
  tiktok: {
    hook: ["🔥 {hook}", "⚡ {hook}", "🚨 {hook}", "👀 {hook}"],
    body: ["{description}", "{description} 💯", "{description} ✨"],
    cta: ["Follow for more! 🎯", "Like if you agree! ❤️", "Share this! 🔄", "Comment below! 💬"],
  },
  instagram: {
    hook: ["{hook} 💫", "{hook} ✨", "{hook} 🌟"],
    body: ["{description}\n\n", "{description} 💡\n\n"],
    cta: [
      "Double tap if you love this! ❤️",
      "Save for later! 📌",
      "Share with friends! 🔄",
      "Tag someone! 👇",
    ],
  },
  youtube: {
    hook: ["{hook}", "{hook} | {title}"],
    body: ["{description}\n\n⏰ Timestamps:\n{timestamps}\n\n"],
    cta: ["👍 Like & Subscribe!", "🔔 Turn on notifications!", "💬 Comment your thoughts!"],
  },
  twitter: {
    hook: ["{hook}", "🧵 {hook}"],
    body: ["{description}"],
    cta: ["RT if you agree!", "Reply with your thoughts!", "Follow for more!"],
  },
  facebook: {
    hook: ["{hook}", "{hook} 🎯"],
    body: ["{description}\n\n"],
    cta: ["Like & Share! 👍", "Comment below! 💬", "Follow for more! ➕"],
  },
};

/**
 * Calculate optimal posting time for platform
 * @param {string} platform - Platform name
 * @param {string} timezone - User timezone (default: UTC)
 * @param {Date} preferredDate - Preferred date (optional)
 * @returns {object} Optimal posting time with score
 */
function calculateOptimalPostingTime(platform, timezone = "UTC", preferredDate = null) {
  const now = preferredDate || new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const peakTimes = PEAK_TIMES[platform] || PEAK_TIMES.instagram;
  const schedule = isWeekend ? peakTimes.weekend : peakTimes.weekday;

  // Find next peak time
  const currentHour = now.getUTCHours();
  let bestTime = null;
  let bestScore = 0;

  for (const slot of schedule) {
    if (currentHour < slot.start) {
      // Future slot today
      const postTime = new Date(now);
      postTime.setUTCHours(slot.start, 0, 0, 0);

      if (!bestTime || slot.score > bestScore) {
        bestTime = postTime;
        bestScore = slot.score;
      }
    }
  }

  // If no slot today, get first slot tomorrow
  if (!bestTime) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIsWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
    const tomorrowSchedule = tomorrowIsWeekend ? peakTimes.weekend : peakTimes.weekday;

    const firstSlot = tomorrowSchedule[0];
    bestTime = new Date(tomorrow);
    bestTime.setUTCHours(firstSlot.start, 0, 0, 0);
    bestScore = firstSlot.score;
  }

  return {
    optimalTime: bestTime.toISOString(),
    score: bestScore,
    timeSlot: `${bestTime.getUTCHours()}:00 - ${bestTime.getUTCHours() + 2}:00 UTC`,
    isWeekend,
    platform,
    timezone,
  };
}

/**
 * Get all peak times for a platform in the next 7 days
 * @param {string} platform - Platform name
 * @param {number} days - Number of days to look ahead
 * @returns {Array} Array of peak time slots
 */
function getPeakTimeSlots(platform, days = 7) {
  const slots = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const peakTimes = PEAK_TIMES[platform] || PEAK_TIMES.instagram;
    const schedule = isWeekend ? peakTimes.weekend : peakTimes.weekday;

    for (const slot of schedule) {
      const slotTime = new Date(date);
      slotTime.setUTCHours(slot.start, 0, 0, 0);

      if (slotTime > now) {
        slots.push({
          time: slotTime.toISOString(),
          score: slot.score,
          dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek],
          isWeekend,
          timeRange: `${slot.start}:00 - ${slot.end}:00 UTC`,
        });
      }
    }
  }

  return slots.sort((a, b) => b.score - a.score);
}

/**
 * Optimize caption for platform
 * @param {object} content - Content object
 * @param {string} platform - Platform name
 * @param {object} options - Additional options
 * @returns {object} Optimized caption with metadata
 */
async function optimizeCaption(content, platform, options = {}) {
  const formatting = PLATFORM_FORMATTING[platform] || PLATFORM_FORMATTING.instagram;
  const templates = CAPTION_TEMPLATES[platform] || CAPTION_TEMPLATES.instagram;

  // Generate hook (first 3 seconds worth of text)
  const hook = generateHook(content, platform);

  // Get hashtags
  const hashtagData = await hashtagEngine.generateCustomHashtags({
    content,
    platform,
    customTags: options.customTags || [],
    growthGuarantee: options.growthGuarantee !== false,
  });

  // Build caption
  let caption = "";

  // Add hook
  const hookTemplate = templates.hook[Math.floor(Math.random() * templates.hook.length)];
  caption += hookTemplate.replace("{hook}", hook) + "\n\n";

  // Add body
  const bodyTemplate = templates.body[Math.floor(Math.random() * templates.body.length)];
  let description = content.description || "";

  // Truncate if needed
  const maxBodyLength =
    formatting.captionMaxLength - caption.length - hashtagData.hashtagString.length - 100;
  if (description.length > maxBodyLength) {
    description = description.substring(0, maxBodyLength - 3) + "...";
  }

  caption += bodyTemplate
    .replace("{description}", description)
    .replace("{title}", content.title || "");

  // Add CTA
  const ctaTemplate = templates.cta[Math.floor(Math.random() * templates.cta.length)];
  caption += "\n" + ctaTemplate + "\n\n";

  // Add hashtags (limit based on platform)
  const hashtagsToUse = hashtagData.hashtags.slice(0, formatting.hashtagLimit);
  caption += hashtagsToUse.join(" ");

  // Final length check
  if (caption.length > formatting.captionMaxLength) {
    caption = caption.substring(0, formatting.captionMaxLength - 3) + "...";
  }

  return {
    caption,
    hook,
    hashtags: hashtagsToUse,
    hashtagData,
    length: caption.length,
    maxLength: formatting.captionMaxLength,
    platform,
    optimizedAt: new Date().toISOString(),
  };
}

/**
 * Generate attention-grabbing hook
 * @param {object} content - Content object
 * @param {string} platform - Platform name
 * @returns {string} Generated hook
 */
function generateHook(content, platform) {
  const title = content.title || "";
  const category = content.category || hashtagEngine.detectCategory(content);

  // Hook templates by category
  const hookTemplates = {
    entertainment: [
      "You won't believe this!",
      "This is hilarious!",
      "Wait for it...",
      "This made my day!",
      "I can't stop laughing!",
    ],
    lifestyle: [
      "Life-changing tip!",
      "You need to try this!",
      "This changed everything!",
      "Best decision ever!",
      "Game changer alert!",
    ],
    education: [
      "Here's what nobody tells you:",
      "The secret to {topic}:",
      "Learn this in 60 seconds:",
      "This will blow your mind:",
      "Everything you need to know:",
    ],
    fitness: [
      "Transform your body!",
      "Get results fast!",
      "This workout is insane!",
      "Feel the burn!",
      "No equipment needed!",
    ],
    food: [
      "This recipe is amazing!",
      "So easy to make!",
      "Tastes incredible!",
      "You have to try this!",
      "Better than restaurant!",
    ],
    tech: [
      "This is revolutionary!",
      "Tech game changer!",
      "You need this!",
      "Mind-blowing tech!",
      "Future is here!",
    ],
    business: [
      "Grow your business fast!",
      "Make money online!",
      "Business hack revealed!",
      "Scale to 6 figures!",
      "Entrepreneur secret!",
    ],
  };

  const templates = hookTemplates[category] || hookTemplates.entertainment;
  let hook = templates[Math.floor(Math.random() * templates.length)];

  // Personalize with title if available
  if (title.length > 10 && title.length < 50) {
    hook = title;
  }

  return hook;
}

/**
 * Optimize content for platform-specific algorithm
 * @param {object} content - Content object
 * @param {string} platform - Platform name
 * @returns {object} Optimization recommendations
 */
function optimizeForPlatformAlgorithm(content, platform) {
  const formatting = PLATFORM_FORMATTING[platform] || PLATFORM_FORMATTING.instagram;
  const recommendations = [];

  // Video length optimization
  if (content.type === "video" && content.duration) {
    const duration = content.duration;
    const optimal = formatting.videoLengthRecommended.optimal;

    if (duration < formatting.videoLengthRecommended.min) {
      recommendations.push({
        type: "video_length",
        severity: "high",
        message: `Video is too short. Recommended: ${formatting.videoLengthRecommended.min}+ seconds`,
        currentValue: duration,
        recommendedValue: optimal,
      });
    } else if (duration > formatting.videoLengthRecommended.max) {
      recommendations.push({
        type: "video_length",
        severity: "medium",
        message: `Video might be too long. Optimal: ${optimal} seconds`,
        currentValue: duration,
        recommendedValue: optimal,
      });
    }
  }

  // Hook timing
  recommendations.push({
    type: "hook_timing",
    severity: "high",
    message: `Grab attention in first ${formatting.hookDuration} seconds`,
    recommendedValue: formatting.hookDuration,
  });

  // Aspect ratio
  if (content.type === "video") {
    recommendations.push({
      type: "aspect_ratio",
      severity: "medium",
      message: `Use ${Array.isArray(formatting.aspectRatio) ? formatting.aspectRatio.join(" or ") : formatting.aspectRatio} aspect ratio`,
      recommendedValue: formatting.aspectRatio,
    });
  }

  // Platform-specific features
  recommendations.push({
    type: "platform_features",
    severity: "low",
    message: `Consider using: ${formatting.features.join(", ")}`,
    recommendedValue: formatting.features,
  });

  // Sound/music (for TikTok)
  if (platform === "tiktok" && formatting.soundRequired) {
    recommendations.push({
      type: "sound",
      severity: "high",
      message: "Use trending sound for maximum reach",
      recommendedValue: "trending_sound",
    });
  }

  return {
    platform,
    recommendations,
    formatting,
    optimizationScore: calculateOptimizationScore(recommendations),
  };
}

/**
 * Calculate optimization score
 * @param {Array} recommendations - Array of recommendations
 * @returns {number} Score from 0-100
 */
function calculateOptimizationScore(recommendations) {
  const highSeverity = recommendations.filter(r => r.severity === "high").length;
  const mediumSeverity = recommendations.filter(r => r.severity === "medium").length;
  const lowSeverity = recommendations.filter(r => r.severity === "low").length;

  const score = 100 - highSeverity * 20 - mediumSeverity * 10 - lowSeverity * 5;
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate complete distribution strategy
 * @param {object} content - Content object
 * @param {Array} platforms - Target platforms
 * @param {object} options - Additional options
 * @returns {Promise<object>} Complete distribution strategy
 */
async function generateDistributionStrategy(content, platforms, options = {}) {
  const strategy = {
    content,
    platforms: [],
    generatedAt: new Date().toISOString(),
  };

  for (const platform of platforms) {
    // Calculate optimal posting time
    const timing = calculateOptimalPostingTime(platform, options.timezone);

    // Optimize caption
    const captionData = await optimizeCaption(content, platform, options);

    // Get algorithm optimization
    const algorithmOpt = optimizeForPlatformAlgorithm(content, platform);

    // Get peak time slots
    const peakSlots = getPeakTimeSlots(platform, 7).slice(0, 5);

    strategy.platforms.push({
      platform,
      timing,
      caption: captionData,
      algorithmOptimization: algorithmOpt,
      peakSlots,
      priority: calculatePlatformPriority(platform, content, algorithmOpt.optimizationScore),
    });
  }

  // Sort by priority
  strategy.platforms.sort((a, b) => b.priority - a.priority);

  return strategy;
}

/**
 * Calculate platform priority for content
 * @param {string} platform - Platform name
 * @param {object} content - Content object
 * @param {number} optimizationScore - Optimization score
 * @returns {number} Priority score
 */
function calculatePlatformPriority(platform, content, optimizationScore) {
  let priority = optimizationScore;

  // Boost priority based on content type and platform match
  const platformContentMatch = {
    tiktok: { video: 1.5, image: 0.7 },
    instagram: { video: 1.3, image: 1.4 },
    youtube: { video: 1.5, image: 0.5 },
    twitter: { video: 1.0, image: 1.0 },
    facebook: { video: 1.2, image: 1.1 },
  };

  const match = platformContentMatch[platform]?.[content.type] || 1.0;
  priority *= match;

  return Math.round(priority);
}

module.exports = {
  calculateOptimalPostingTime,
  getPeakTimeSlots,
  optimizeCaption,
  generateHook,
  optimizeForPlatformAlgorithm,
  generateDistributionStrategy,
  PEAK_TIMES,
  PLATFORM_FORMATTING,
  CAPTION_TEMPLATES,
};
