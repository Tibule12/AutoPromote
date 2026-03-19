// repostSchedulerService.js - determine when to enqueue repost tasks based on decay & engagement
const { db } = require("../firebaseAdmin");
const { enqueuePlatformPostTask, enqueueMediaTransform } = require("./promotionTaskQueue");
const performanceValidationEngine = require("./performanceValidationEngine");
const monetizationService = require("./monetizationService"); // This will leverage the new results-based logic
const notificationEngine = require("./notificationEngine");
const logger = require("./logger");

const DEFAULT_REPOST_LIMITS = Object.freeze({
  free: 2,
  premium: 3,
  pro: 4,
  enterprise: 5,
});

const REPOST_PLAN_ALIASES = Object.freeze({
  free: "free",
  starter: "free",
  basic: "premium",
  premium: "premium",
  creator: "premium",
  growth_pro: "premium",
  pro: "pro",
  studio: "pro",
  analytics_plus: "pro",
  enterprise: "enterprise",
  team: "enterprise",
});

function normalizeRepostPlan(planId) {
  const raw = String(planId || "free")
    .trim()
    .toLowerCase();
  return REPOST_PLAN_ALIASES[raw] || "free";
}

function getEnvInt(name, fallback) {
  const parsed = parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRepostLimitForPlan(planId) {
  const normalized = normalizeRepostPlan(planId);
  const envKey = `REPOST_MAX_ATTEMPTS_${normalized.toUpperCase()}`;
  return getEnvInt(envKey, DEFAULT_REPOST_LIMITS[normalized] || DEFAULT_REPOST_LIMITS.free);
}

function hasExplicitOptOut(userData = {}, subscriptionData = {}) {
  const candidates = [
    userData.autoRepostEnabled,
    userData.auto_repost_enabled,
    userData.viralRecyclingEnabled,
    userData.settings && userData.settings.autoRepostEnabled,
    userData.settings && userData.settings.auto_repost_enabled,
    userData.preferences && userData.preferences.autoRepostEnabled,
    userData.automation && userData.automation.autoRepostEnabled,
    subscriptionData.autoRepostEnabled,
    subscriptionData.settings && subscriptionData.settings.autoRepostEnabled,
  ];

  return candidates.some(value => value === false);
}

async function resolveUserRepostPolicy(uid) {
  const [userSnap, subscriptionSnap] = await Promise.all([
    db
      .collection("users")
      .doc(uid)
      .get()
      .catch(() => null),
    db
      .collection("user_subscriptions")
      .doc(uid)
      .get()
      .catch(() => null),
  ]);

  const userData = userSnap && userSnap.exists ? userSnap.data() : {};
  const subscriptionData =
    subscriptionSnap && subscriptionSnap.exists ? subscriptionSnap.data() : {};
  const rawPlan =
    userData.subscriptionTier ||
    (userData.plan && (userData.plan.tier || userData.plan.id)) ||
    subscriptionData.planId ||
    subscriptionData.tier ||
    "free";
  const planId = normalizeRepostPlan(rawPlan);

  return {
    enabled: !hasExplicitOptOut(userData, subscriptionData),
    planId,
    maxAttempts: getRepostLimitForPlan(planId),
  };
}

async function getScheduledRepostAttempts({ contentData = {}, contentId, platform }) {
  const stateAttempts =
    contentData.autoRepostState &&
    contentData.autoRepostState.platforms &&
    contentData.autoRepostState.platforms[platform] &&
    contentData.autoRepostState.platforms[platform].attemptsScheduled;

  if (typeof stateAttempts === "number" && stateAttempts >= 0) {
    return stateAttempts;
  }

  try {
    const snap = await db
      .collection("platform_posts")
      .where("contentId", "==", contentId)
      .where("platform", "==", platform)
      .get();

    let attempts = 0;
    snap.forEach(doc => {
      const data = doc.data() || {};
      const repostMode =
        data.payload && data.payload.repostMetadata && data.payload.repostMetadata.mode;
      if (data.reason === "decay_repost" || repostMode === "smart_decay_repost") {
        attempts += 1;
      }
    });

    return attempts;
  } catch (_) {
    return 0;
  }
}

function truncateTitle(title) {
  if (!title) return "";
  const normalized = String(title).replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function normalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);
}

function trimToLength(value, maxLength) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function hashString(value) {
  const input = String(value || "");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildBaseSubject(contentData) {
  const label = truncateTitle(contentData.title)
    .replace(/^"+|"+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  return label || "This clip";
}

function extractKeywordCandidates(contentData, niche) {
  const tokens = [
    ...normalizeWords(contentData?.title),
    ...normalizeWords(contentData?.description),
    ...normalizeWords(contentData?.meta?.keywords),
    ...normalizeWords(contentData?.meta?.topic),
    ...normalizeWords(contentData?.monetization_settings?.niche),
  ];
  const banned = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "your",
    "from",
    "have",
    "just",
    "into",
    "about",
    "when",
    "what",
    "they",
    "them",
    "will",
    "would",
    "there",
    "here",
    "video",
    "clip",
    "look",
    "watch",
    "more",
    "than",
    "been",
    "were",
    niche,
  ]);
  const freq = new Map();
  tokens.forEach(token => {
    if (token.length < 3 || banned.has(token)) return;
    freq.set(token, (freq.get(token) || 0) + 1);
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 6);
}

function getPlatformCreativeProfile(platform) {
  const key = String(platform || "default").toLowerCase();
  const profiles = {
    tiktok: {
      titleMax: 80,
      descriptionMax: 150,
      hashtagCount: 5,
      cta: "Wait for the payoff.",
      voice: "urgent",
      previewLabel: "For You preview",
      creatorLine: "Hook-heavy vertical preview",
    },
    instagram: {
      titleMax: 64,
      descriptionMax: 180,
      hashtagCount: 8,
      cta: "Save this one for later.",
      voice: "polished",
      previewLabel: "Reels preview",
      creatorLine: "Aesthetic first-frame preview",
    },
    facebook: {
      titleMax: 90,
      descriptionMax: 220,
      hashtagCount: 4,
      cta: "Drop your take below.",
      voice: "broad",
      previewLabel: "Feed preview",
      creatorLine: "Social feed card preview",
    },
    youtube: {
      titleMax: 96,
      descriptionMax: 240,
      hashtagCount: 3,
      cta: "Watch the switch in the first seconds.",
      voice: "searchable",
      previewLabel: "Shorts preview",
      creatorLine: "Search-friendly shorts preview",
    },
    default: {
      titleMax: 80,
      descriptionMax: 180,
      hashtagCount: 5,
      cta: "Watch closely.",
      voice: "general",
      previewLabel: "Native preview",
      creatorLine: "Optimized platform preview",
    },
  };
  return profiles[key] || profiles.default;
}

function getPlatformHookVariants({ platform, niche, shortLabel, subject, keywords }) {
  const profile = getPlatformCreativeProfile(platform);
  const focusKeyword = keywords[0] || keywords[1] || normalizeWords(subject)[0] || "detail";
  const cleanSubject = shortLabel || subject || "this clip";
  const byVoice = {
    urgent: [
      `Stop scrolling before the ${focusKeyword} shift in ${cleanSubject}`,
      `You miss the ${focusKeyword} turn if you blink here`,
      `${cleanSubject} gets serious in the first seconds`,
      `The opening on ${cleanSubject} is built to pull you in`,
    ],
    polished: [
      `The frame that finally makes ${cleanSubject} land`,
      `${cleanSubject} with the cleaner first impression`,
      `The polished reveal that makes ${cleanSubject} work`,
      `${cleanSubject}, styled to hold attention immediately`,
    ],
    searchable: [
      `Why ${cleanSubject} works better with this setup`,
      `The clearer entry point for ${cleanSubject}`,
      `What makes ${cleanSubject} easier to follow here`,
      `${cleanSubject} explained through a sharper opening`,
    ],
    broad: [
      `This is the part that changes how ${cleanSubject} reads`,
      `${cleanSubject} feels different once this lands`,
      `The one moment that makes ${cleanSubject} click`,
      `${cleanSubject} comes through better with this opener`,
    ],
    general: [
      `The first beat of ${cleanSubject} is the reason to stay`,
      `${cleanSubject} comes back stronger with this intro`,
      `The sharper angle on ${cleanSubject} starts here`,
      `${cleanSubject} needed this cleaner hook`,
    ],
  };

  const nicheBoosters = {
    tech: [
      `The ${focusKeyword} detail in ${cleanSubject} changes the whole read`,
      `${cleanSubject} lands once the smarter setup kicks in`,
    ],
    crypto: [
      `The conviction point in ${cleanSubject} starts right here`,
      `${cleanSubject} hits harder once the timing is cleaned up`,
    ],
    fitness: [
      `The form detail in ${cleanSubject} is what holds attention`,
      `${cleanSubject} works because the movement reads faster now`,
    ],
    fashion: [
      `The styling detail in ${cleanSubject} is what sells it`,
      `${cleanSubject} needed a cleaner reveal to really hit`,
    ],
    music: [
      `The switch in ${cleanSubject} lands harder with this intro`,
      `${cleanSubject} opens with the part listeners stay for`,
    ],
    comedy: [
      `The setup in ${cleanSubject} now holds just long enough`,
      `${cleanSubject} hits because the turn shows up faster`,
    ],
    education: [
      `The useful insight in ${cleanSubject} starts immediately`,
      `${cleanSubject} makes sense quicker with this framing`,
    ],
  };

  return [...(byVoice[profile.voice] || byVoice.general), ...(nicheBoosters[niche] || [])];
}

async function maybeSendRepostNotification({
  uid,
  contentId,
  contentData,
  platform,
  attemptNumber,
  maxAttempts,
  autoScheduled,
  platformState = {},
}) {
  if (!uid || !contentId) return null;

  const attemptField = autoScheduled ? "lastAutoRepostNoticeAttempt" : "lastPreviewPromptAttempt";
  const atField = autoScheduled ? "lastAutoRepostNoticeAt" : "lastPreviewPromptAt";
  if (Number(platformState?.[attemptField] || 0) >= attemptNumber) {
    return null;
  }

  const platformLabel = String(platform || "default");
  const contentLabel = buildBaseSubject(contentData);
  const title = autoScheduled ? "Smart repost queued" : "Repost preview recommended";
  const message = autoScheduled
    ? `${platformLabel.charAt(0).toUpperCase() + platformLabel.slice(1)} performance cooled on ${contentLabel}. Smart repost ${attemptNumber}/${maxAttempts} is queued. Open Upload History to inspect the preview style.`
    : `${platformLabel.charAt(0).toUpperCase() + platformLabel.slice(1)} performance cooled on ${contentLabel}. Open Upload History and tap Build repost preview for a sharper new angle.`;

  try {
    await notificationEngine.sendNotification(uid, message, "viral", {
      title,
      contentId,
      platform,
      attemptNumber,
      maxAttempts,
      targetTab: "upload",
      targetPanel: "history",
      ctaLabel: autoScheduled ? "Open Upload History" : "Build repost preview",
      notificationKind: autoScheduled ? "auto_repost_scheduled" : "repost_preview_prompt",
    });

    return {
      [attemptField]: attemptNumber,
      [atField]: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn(`[RepostScheduler] Failed to notify ${uid}: ${error.message}`);
    return null;
  }
}

function buildPlatformTitle({ platform, hook, subject, niche }) {
  const profile = getPlatformCreativeProfile(platform);
  const patternsByVoice = {
    urgent: [`${hook}`, `${hook} | ${subject}`, `${subject}: the part people replay`],
    polished: [
      `${subject}, framed the right way`,
      `${hook} | ${subject}`,
      `${subject} with the cleaner reveal`,
    ],
    searchable: [
      `${subject} explained in one sharper pass`,
      `${subject} | ${hook}`,
      `A clearer take on ${subject}`,
    ],
    broad: [
      `${hook} | ${subject}`,
      `${subject} is worth a second look`,
      `${subject} with a cleaner setup`,
    ],
    general: [
      `${hook} | ${subject}`,
      `${subject} is back with a sharper intro`,
      `${subject}: watch the first seconds`,
    ],
  };
  const options = patternsByVoice[profile.voice] || patternsByVoice.general;
  const selected = options[(normalizeWords(subject).length + niche.length) % options.length];
  return trimToLength(selected, profile.titleMax);
}

function buildPlatformDescription({ platform, hook, niche, caption }) {
  const profile = getPlatformCreativeProfile(platform);
  const nicheLine =
    {
      tech: "Built to feel cleaner, smarter, and easier to follow.",
      crypto: "Tighter framing so the confidence lands immediately.",
      fitness: "Cleaner timing so the physical detail lands faster.",
      fashion: "Visual polish first so the reveal feels intentional.",
      music: "Sharper entry so the switch lands on time.",
      comedy: "Cleaner pacing so the turn hits exactly where it should.",
      education: "Structured to make the takeaway obvious in seconds.",
      general: "Refined for a stronger first impression and cleaner retention.",
    }[niche] || "Refined for a stronger first impression and cleaner retention.";
  return trimToLength(`${caption} ${nicheLine} ${hook}. ${profile.cta}`, profile.descriptionMax);
}

function buildHashtagSet({ platform, niche, subject, keywords }) {
  const profile = getPlatformCreativeProfile(platform);
  const platformTags = {
    tiktok: ["fyp", "viralvideo", "watchthis", "storytime", "tiktokcreator"],
    instagram: ["reels", "reelitfeelit", "instareels", "creator", "discover"],
    facebook: ["facebookvideo", "watchmore", "socialvideo", "creatorupdate"],
    youtube: ["shorts", "youtubeshorts", "watchnow", "creatorclips"],
    default: ["viralcontent", "creator", "watchthis", "contentstrategy"],
  };
  const nicheTags = {
    tech: ["tech", "aitools", "digitalstrategy"],
    crypto: ["crypto", "marketwatch", "web3"],
    fitness: ["fitness", "training", "bodygoals"],
    fashion: ["fashion", "style", "visualstory"],
    music: ["music", "sounddesign", "artist"],
    comedy: ["comedy", "funny", "timing"],
    education: ["learn", "explained", "quicklesson"],
    general: ["mustwatch", "attention", "spotlight"],
  };
  const subjectTags = normalizeWords(subject)
    .filter(word => word.length >= 4)
    .slice(0, 2)
    .map(word => word.replace(/[^a-z0-9]/g, ""));
  const merged = [
    ...(platformTags[String(platform || "default").toLowerCase()] || platformTags.default),
    ...(nicheTags[niche] || nicheTags.general),
    ...subjectTags,
    ...(keywords || []).slice(0, 2),
  ];
  const seen = new Set();
  return merged
    .map(tag => String(tag || "").replace(/[^a-z0-9]/gi, ""))
    .filter(tag => tag.length >= 3)
    .filter(tag => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, profile.hashtagCount)
    .map(tag => `#${tag}`);
}

function inferRepostNiche(contentData) {
  const explicit = [
    contentData?.monetization_settings?.niche,
    contentData?.niche,
    contentData?.meta?.niche,
  ]
    .map(value =>
      String(value || "")
        .toLowerCase()
        .trim()
    )
    .find(Boolean);
  if (explicit) return explicit;

  const haystack = `${contentData?.title || ""} ${contentData?.description || ""}`.toLowerCase();
  if (/(crypto|bitcoin|ethereum|solana|trading|bull run)/.test(haystack)) return "crypto";
  if (/(workout|fitness|gym|exercise|fat loss|muscle)/.test(haystack)) return "fitness";
  if (/(outfit|fashion|style|lookbook|streetwear|makeup)/.test(haystack)) return "fashion";
  if (/(beat|music|song|studio|vocal|mixing)/.test(haystack)) return "music";
  if (/(joke|funny|comedy|laugh|skit|punchline)/.test(haystack)) return "comedy";
  if (/(app|code|software|ai|tech|startup|product)/.test(haystack)) return "tech";
  if (/(teach|lesson|tutorial|explained|how to|guide)/.test(haystack)) return "education";
  return "general";
}

function getNicheHookVariants(niche, shortLabel) {
  const byNiche = {
    tech: [
      shortLabel ? `The part of ${shortLabel} most people miss` : "The part most people miss",
      shortLabel
        ? `${shortLabel} lands harder when you see this`
        : "This lands harder than it looks",
      shortLabel ? `Watch the payoff in ${shortLabel}` : "Watch the payoff here",
    ],
    crypto: [
      shortLabel
        ? `Before you fade ${shortLabel}, watch this`
        : "Before you fade this, watch closely",
      shortLabel ? `${shortLabel} turns on this moment` : "The turn happens right here",
      shortLabel ? `This ${shortLabel} setup is cleaner now` : "This setup is cleaner now",
    ],
    fitness: [
      shortLabel ? `${shortLabel} changes with this detail` : "This detail changes the result",
      shortLabel ? `Your eye should go here in ${shortLabel}` : "Your eye should go here",
      shortLabel
        ? `${shortLabel} hits different with the cleaner setup`
        : "This hits different with the cleaner setup",
    ],
    fashion: [
      shortLabel ? `The detail that sells ${shortLabel}` : "The detail that sells the look",
      shortLabel ? `${shortLabel} deserves a cleaner reveal` : "This deserves a cleaner reveal",
      shortLabel ? `Watch how ${shortLabel} comes together` : "Watch how this comes together",
    ],
    music: [
      shortLabel ? `Listen for the switch in ${shortLabel}` : "Listen for the switch",
      shortLabel ? `${shortLabel} opens up after this` : "This opens up after this",
      shortLabel ? `The cleaner drop in ${shortLabel}` : "The cleaner drop is here",
    ],
    comedy: [
      shortLabel
        ? `The timing in ${shortLabel} is the whole point`
        : "The timing is the whole point",
      shortLabel ? `${shortLabel} lands better this way` : "This lands better this way",
      shortLabel ? `Wait for the turn in ${shortLabel}` : "Wait for the turn",
    ],
    education: [
      shortLabel ? `The useful part of ${shortLabel} starts here` : "The useful part starts here",
      shortLabel ? `${shortLabel} makes more sense like this` : "This makes more sense like this",
      shortLabel ? `Watch this clearer version of ${shortLabel}` : "Watch this clearer version",
    ],
    general: [
      shortLabel ? `${shortLabel} deserves a second look` : "Watch this one closely",
      shortLabel ? `The clean comeback: ${shortLabel}` : "A cleaner comeback",
      shortLabel ? `This part of ${shortLabel} hits harder` : "This one lands differently",
      shortLabel ? `Missed ${shortLabel}? Start here` : "Missed it? Start here",
    ],
  };

  return byNiche[niche] || byNiche.general;
}

function getNicheCaptionVariants(niche, subject) {
  const byNiche = {
    tech: [
      `A sharper repost of ${subject} with the setup cleaned up.`,
      `Putting ${subject} back in front of the right technical audience window.`,
      `A tighter rollout for ${subject}, now easier to follow.`,
    ],
    crypto: [
      `Reposting ${subject} with a cleaner, more confident setup.`,
      `A tighter second run for ${subject} while the timing still matters.`,
      `Bringing ${subject} back with a more deliberate rollout.`,
    ],
    fashion: [
      `A cleaner repost of ${subject} with the presentation tightened up.`,
      `Putting ${subject} back in rotation with a stronger visual delivery.`,
      `A more polished return for ${subject}.`,
    ],
    music: [
      `Resurfacing ${subject} with a cleaner mix and stronger entry.`,
      `A refined repost of ${subject} for the audience that missed the moment.`,
      `Putting ${subject} back into rotation with better pacing.`,
    ],
    general: [
      `${subject} is back with a cleaner, sharper rollout.`,
      `Resurfacing ${subject} for the audience that missed it the first time.`,
      `A polished return for ${subject}.`,
      `Putting ${subject} back in rotation with a refined delivery.`,
      `A focused repost of ${subject} for the right audience window.`,
    ],
  };

  return byNiche[niche] || byNiche.general;
}

function buildProfessionalCaption(contentData, attemptNumber) {
  const label = truncateTitle(contentData.title);
  const subject = label ? `\"${label}\"` : "this clip";
  const niche = inferRepostNiche(contentData);
  const variants = getNicheCaptionVariants(niche, subject);

  return variants[(Math.max(attemptNumber, 1) - 1) % variants.length];
}

function buildRepostHook(contentData, attemptNumber, platform = "default") {
  const niche = inferRepostNiche(contentData);
  const subject = buildBaseSubject(contentData);
  const label = truncateTitle(contentData.title)
    .replace(/^"+|"+$/g, "")
    .replace(/[.!?]+$/g, "");
  const shortLabel = label.length > 42 ? `${label.slice(0, 39)}...` : label;
  const keywords = extractKeywordCandidates(contentData, niche);
  const variants = [
    ...getNicheHookVariants(niche, shortLabel),
    ...getPlatformHookVariants({
      platform,
      niche,
      shortLabel,
      subject,
      keywords,
    }),
  ].filter(Boolean);
  const deduped = [...new Set(variants)];
  const seed = hashString(
    [contentData?.id, contentData?.title, contentData?.description, platform, niche, attemptNumber]
      .filter(Boolean)
      .join("|")
  );

  return trimToLength(deduped[seed % deduped.length], 84);
}

function buildRepostCreativePlan(contentData, { attemptNumber = 1, platform = "default" } = {}) {
  const niche = inferRepostNiche(contentData);
  const hook = buildRepostHook(contentData, attemptNumber, platform);
  const caption = buildProfessionalCaption(contentData, attemptNumber);
  const subject = buildBaseSubject(contentData);
  const keywords = extractKeywordCandidates(contentData, niche);
  const profile = getPlatformCreativeProfile(platform);
  return {
    niche,
    platform,
    caption,
    hook,
    title: buildPlatformTitle({ platform, hook, subject, niche }),
    description: buildPlatformDescription({ platform, hook, niche, caption }),
    hashtags: buildHashtagSet({ platform, niche, subject, keywords }),
    keywords,
    previewLabel: profile.previewLabel,
    creatorLine: profile.creatorLine,
  };
}

function computeRepostOpportunityScore({
  impressions,
  engagementRate,
  hoursSinceLatest,
  maxImpressionsCap,
}) {
  const reachScore = Math.min(impressions / Math.max(maxImpressionsCap, 1), 1);
  const engagementScore = Math.min(engagementRate * 12, 1);
  const freshnessScore = Math.min(hoursSinceLatest / 24, 1);
  return reachScore * 0.45 + engagementScore * 0.35 + freshnessScore * 0.2;
}

/* Heuristic:
   For each content with at least one successful platform_post in last REPOST_LOOKBACK_HOURS,
   compute decay = (latest impressions delta / hours since first post). If impressions growth per hour
   has dropped below threshold but total impressions < potential ceiling (based on youtube velocity or prior top post),
   schedule a repost (platform_post task with reason 'decay_repost').
*/

async function analyzeAndScheduleReposts({ limit = 10 }) {
  const hours = parseInt(process.env.REPOST_LOOKBACK_HOURS || "24", 10);
  const since = Date.now() - hours * 3600000;
  const minImpressionsForRepost = parseInt(
    process.env.REPOST_MIN_IMPRESSIONS_BEFORE_RETRY || "250",
    10
  );
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
    const hoursSinceLatest = Math.max((Date.now() - latest.ts) / 3600000, 0);
    let impressions = 0;
    let interactions = 0;
    arr.forEach(p => {
      if (p.metrics && p.metrics.impressions) impressions += p.metrics.impressions;
      if (p.metrics) {
        interactions +=
          (p.metrics.likes || 0) +
          (p.metrics.comments || 0) +
          (p.metrics.shares || 0) +
          (p.metrics.saves || 0);
      }
    });
    const growthPerHour = impressions / hoursSpan;
    const engagementRate = impressions > 0 ? interactions / impressions : 0;
    const velocityThreshold = parseFloat(process.env.REPOST_MIN_GROWTH_PER_HOUR || "5");
    const maxImpressionsCap = parseInt(process.env.REPOST_MAX_IMPRESSIONS_CAP || "5000", 10);
    if (
      growthPerHour < velocityThreshold &&
      impressions >= minImpressionsForRepost &&
      impressions < maxImpressionsCap
    ) {
      const cooldownHrs = parseInt(process.env.REPOST_COOLDOWN_HOURS || "6", 10);
      const lastTs = latest.ts;
      if (Date.now() - lastTs < cooldownHrs * 3600000) continue;
      tasks.push({
        contentId: latest.contentId,
        platform: latest.platform,
        impressions,
        growthPerHour,
        engagementRate,
        opportunityScore: computeRepostOpportunityScore({
          impressions,
          engagementRate,
          hoursSinceLatest,
          maxImpressionsCap,
        }),
      });
    }
  }

  tasks.sort((a, b) => b.opportunityScore - a.opportunityScore);

  let scheduled = 0;
  for (const t of tasks.slice(0, limit)) {
    try {
      let baselinePostId = null;
      try {
        const checkSnap = await db
          .collection("platform_posts")
          .where("contentId", "==", t.contentId)
          .where("platform", "==", t.platform)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();

        if (!checkSnap.empty) {
          baselinePostId = checkSnap.docs[0].id;
          const lastPost = checkSnap.docs[0].data();
          const lastTs =
            lastPost.createdAt && lastPost.createdAt.toMillis
              ? lastPost.createdAt.toMillis()
              : Date.parse(lastPost.createdAt || "") || 0;

          const safeCooldownHours = parseInt(process.env.REPOST_COOLDOWN_HOURS || "6", 10);
          if (Date.now() - lastTs < safeCooldownHours * 3600000) {
            console.log(
              `[RepostScheduler] Safety Check Blocked: Found recent post for ${t.contentId} from ${lastPost.createdAt}`
            );
            continue;
          }
        }
      } catch (checkErr) {
        console.warn(
          `[RepostScheduler] Safety check failed (index missing?), blocking ${t.contentId} to be safe:`,
          checkErr.message
        );
        continue;
      }

      const pendingSnap = await db
        .collection("promotion_tasks")
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
      const contentData = contentSnap.exists ? contentSnap.data() : null;
      if (!contentData) continue;

      const uid = contentData.user_id || contentData.uid;
      const persistentMediaUrl =
        contentData.processedUrl ||
        contentData.url ||
        contentData.mediaUrl ||
        contentData.downloadInfo?.url;

      if (!uid) continue;

      const repostPolicy = await resolveUserRepostPolicy(uid);
      const scheduledAttempts = await getScheduledRepostAttempts({
        contentData,
        contentId: t.contentId,
        platform: t.platform,
      });
      const currentPlatformState = contentData?.autoRepostState?.platforms?.[t.platform] || {};
      const nextAttemptNumber = scheduledAttempts + 1;
      if (scheduledAttempts >= repostPolicy.maxAttempts) {
        logger.info(
          `[RepostScheduler] Skipping ${t.contentId}/${t.platform}; reached plan cap ${scheduledAttempts}/${repostPolicy.maxAttempts}.`
        );
        continue;
      }

      if (!repostPolicy.enabled) {
        const promptNoticeState = await maybeSendRepostNotification({
          uid,
          contentId: t.contentId,
          contentData,
          platform: t.platform,
          attemptNumber: nextAttemptNumber,
          maxAttempts: repostPolicy.maxAttempts,
          autoScheduled: false,
          platformState: currentPlatformState,
        });

        if (promptNoticeState) {
          await contentSnap.ref.set(
            {
              autoRepostState: {
                lastUpdatedAt: new Date().toISOString(),
                lastPlanId: repostPolicy.planId,
                platforms: {
                  [t.platform]: promptNoticeState,
                },
              },
            },
            { merge: true }
          );
        }

        logger.info(
          `[RepostScheduler] Skipping ${t.contentId} because user ${uid} opted out of auto reposts.`
        );
        continue;
      }

      const attemptNumber = nextAttemptNumber;
      const creativePlan = buildRepostCreativePlan(contentData, {
        attemptNumber,
        platform: t.platform,
      });
      const repostMessage = creativePlan.caption;
      const repostHook = creativePlan.hook;
      const repostMetadata = {
        mode: "smart_decay_repost",
        attemptNumber,
        maxAttempts: repostPolicy.maxAttempts,
        planId: repostPolicy.planId,
        baselinePostId,
        niche: creativePlan.niche,
        creativeHook: repostHook,
        growthPerHour: Number(t.growthPerHour.toFixed(2)),
        impressions: t.impressions,
        engagementRate: Number(t.engagementRate.toFixed(4)),
        opportunityScore: Number(t.opportunityScore.toFixed(4)),
      };

      try {
        const nextTime = new Date(Date.now() + 1000 * 60 * 5).toISOString();
        db.collection("promotion_schedules")
          .add({
            contentId: t.contentId,
            user_id: uid,
            platform: t.platform,
            startTime: nextTime,
            scheduleType: "auto_repost",
            isActive: true,
            status: "processing",
            reason: "view_decay_detected",
            message: `Smart repost ${attemptNumber}/${repostPolicy.maxAttempts}`,
            repostPlan: repostPolicy.planId,
            repostAttempt: attemptNumber,
            repostLimit: repostPolicy.maxAttempts,
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
      } catch (_) {}

      await contentSnap.ref.set(
        {
          autoRepostState: {
            lastUpdatedAt: new Date().toISOString(),
            lastPlanId: repostPolicy.planId,
            platforms: {
              [t.platform]: {
                attemptsScheduled: attemptNumber,
                maxAttempts: repostPolicy.maxAttempts,
                lastScheduledAt: new Date().toISOString(),
                lastReason: "decay_repost",
                lastGrowthPerHour: repostMetadata.growthPerHour,
                lastImpressions: repostMetadata.impressions,
                lastOpportunityScore: repostMetadata.opportunityScore,
              },
            },
          },
        },
        { merge: true }
      );

      try {
        const sourceUrl = t.mediaUrl || t.payload?.mediaUrl || t.payload?.url || persistentMediaUrl;
        if (sourceUrl) {
          console.log(
            `[RepostScheduler] Routing ${t.contentId} through Strategic Transform for safety.`
          );
          await enqueueMediaTransform({
            contentId: t.contentId,
            uid,
            sourceUrl,
            meta: {
              isRepost: true,
              forceVariance: true,
              viral_remix: true,
              repostReason: "decay_repost",
              repostMetadata,
              hookText: repostHook,
              creativeProfile: "smart_repost_polish_v1",
              targetPlatform: t.platform,
              hookIntroSeconds: 3,
              enableBurnedCaptions: true,
              postAfterTransform: [t.platform],
              nextMessage: repostMessage,
              nextPayload: {
                message: repostMessage,
                title: creativePlan.title,
                description: creativePlan.description,
                hashtags: creativePlan.hashtags,
                hookText: repostHook,
                platformOptions: {
                  repost_reason: "decay_optimization",
                  repost_attempt: attemptNumber,
                  repost_plan: repostPolicy.planId,
                  repost_intro_seconds: 3,
                },
                repostMetadata,
              },
              quality_enhanced: true,
              creativeTitle: creativePlan.title,
              creativeDescription: creativePlan.description,
              creativeHashtags: creativePlan.hashtags,
              creativeCaption: creativePlan.caption,
              creativePreviewLabel: creativePlan.previewLabel,
              creativeCreatorLine: creativePlan.creatorLine,
            },
          });
          const autoRepostNoticeState = await maybeSendRepostNotification({
            uid,
            contentId: t.contentId,
            contentData,
            platform: t.platform,
            attemptNumber,
            maxAttempts: repostPolicy.maxAttempts,
            autoScheduled: true,
            platformState: currentPlatformState,
          });

          if (autoRepostNoticeState) {
            await contentSnap.ref.set(
              {
                autoRepostState: {
                  lastUpdatedAt: new Date().toISOString(),
                  lastPlanId: repostPolicy.planId,
                  platforms: {
                    [t.platform]: autoRepostNoticeState,
                  },
                },
              },
              { merge: true }
            );
          }
          scheduled++;
          continue;
        }
      } catch (e) {
        console.warn(
          `[RepostScheduler] Transform queue failed, falling back to direct post: ${e.message}`
        );
      }

      await enqueuePlatformPostTask({
        contentId: t.contentId,
        uid,
        platform: t.platform,
        reason: "decay_repost",
        payload: {
          message: repostMessage,
          title: creativePlan.title,
          description: creativePlan.description,
          hashtags: creativePlan.hashtags,
          mediaUrl: persistentMediaUrl,
          platformOptions: {
            repost_reason: "decay_optimization",
            repost_attempt: attemptNumber,
            repost_plan: repostPolicy.planId,
          },
          repostMetadata,
        },
        skipIfDuplicate: true,
        forceRepost: true,
      });
      const autoRepostNoticeState = await maybeSendRepostNotification({
        uid,
        contentId: t.contentId,
        contentData,
        platform: t.platform,
        attemptNumber,
        maxAttempts: repostPolicy.maxAttempts,
        autoScheduled: true,
        platformState: currentPlatformState,
      });

      if (autoRepostNoticeState) {
        await contentSnap.ref.set(
          {
            autoRepostState: {
              lastUpdatedAt: new Date().toISOString(),
              lastPlanId: repostPolicy.planId,
              platforms: {
                [t.platform]: autoRepostNoticeState,
              },
            },
          },
          { merge: true }
        );
      }
      scheduled++;
    } catch (e) {
      /* ignore */
    }
  }

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
    const snapshot = await db
      .collection("platform_posts")
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
          const originals = await db
            .collection("platform_posts")
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
        } catch (e) {
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
      const validation = await performanceValidationEngine.validatePerformance(
        originalPostId,
        variantId
      );

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
        validatedAt: new Date().toISOString(),
      });

      const lift = validation.report?.lift?.views || 0;
      if (chargeResult.charged) {
        logger.info(
          `[ValidationOrchestrator] CHARGED user ${userId} ${chargeResult.amount} credits. Lift: ${lift}%`
        );
      } else {
        logger.info(
          `[ValidationOrchestrator] NO CHARGE for user ${userId}. Improvement (${lift}%) did not meet threshold.`
        );
      }
    }
  } catch (error) {
    logger.error("Error in scheduleResultVerifications:", error);
  }
}

module.exports = { analyzeAndScheduleReposts, buildRepostCreativePlan };
