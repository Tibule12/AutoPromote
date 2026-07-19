const { db, admin } = require("../firebaseAdmin");

const PROFILE_VERSION = 1;
const MAX_PROFILE_OUTCOMES = 200;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, Number(value) || 0));

const toNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const normalizeToken = (value, fallback = "unknown") =>
  String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || fallback;

const durationBucket = duration => {
  const seconds = Math.max(0, Number(duration) || 0);
  if (seconds <= 10) return "under_10s";
  if (seconds <= 20) return "10_20s";
  if (seconds <= 35) return "20_35s";
  if (seconds <= 60) return "35_60s";
  return "over_60s";
};

const normalizeRatio = (value, durationSeconds = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  if (numeric <= 1) return numeric;
  if (numeric <= 100) return numeric / 100;
  if (durationSeconds > 0 && numeric <= durationSeconds * 1.5) {
    return numeric / durationSeconds;
  }
  return null;
};

function normalizeOutcomeMetrics(snapshot = {}, fallbackMetrics = {}) {
  const metrics = { ...(fallbackMetrics || {}), ...(snapshot || {}) };
  return {
    views: Math.max(0, toNumber(metrics.views, metrics.view_count, metrics.impressions)),
    likes: Math.max(0, toNumber(metrics.likes, metrics.like_count)),
    comments: Math.max(0, toNumber(metrics.comments, metrics.comment_count)),
    shares: Math.max(
      0,
      toNumber(metrics.shares, metrics.share_count, metrics.retweets, metrics.retweet_count)
    ),
    retention: metrics.retention ?? metrics.average_view_duration ?? metrics.watch_time ?? null,
    completionRate: metrics.completionRate ?? metrics.completion_rate ?? null,
  };
}

function calculateClipOutcomeScore({ metrics, normalizedPlatformScore = null, duration = 0 }) {
  const normalized = normalizeOutcomeMetrics(metrics);
  const views = Math.max(1, normalized.views);
  const likeRate = normalized.likes / views;
  const commentRate = normalized.comments / views;
  const shareRate = normalized.shares / views;

  const engagementScore = clamp(
    (likeRate / 0.05) * 35 + (commentRate / 0.008) * 25 + (shareRate / 0.012) * 40,
    0,
    100
  );
  const completionRatio = normalizeRatio(normalized.completionRate, duration);
  const retentionRatio = normalizeRatio(normalized.retention, duration);
  const watchRatio = completionRatio ?? retentionRatio;
  const retentionScore = watchRatio === null ? null : clamp(watchRatio * 100, 0, 100);
  const platformScore = Number.isFinite(Number(normalizedPlatformScore))
    ? clamp(normalizedPlatformScore, 0, 100)
    : null;

  let weightedTotal = engagementScore * 0.55;
  let totalWeight = 0.55;
  if (platformScore !== null) {
    weightedTotal += platformScore * 0.25;
    totalWeight += 0.25;
  }
  if (retentionScore !== null) {
    weightedTotal += retentionScore * 0.2;
    totalWeight += 0.2;
  }

  const outcomeScore = clamp(weightedTotal / Math.max(totalWeight, 0.01), 0, 100);
  const sampleWeight = clamp(Math.log10(normalized.views + 10) / 4, 0.2, 1);

  return {
    outcomeScore: Number(outcomeScore.toFixed(2)),
    sampleWeight: Number(sampleWeight.toFixed(3)),
    engagementScore: Number(engagementScore.toFixed(2)),
    retentionScore: retentionScore === null ? null : Number(retentionScore.toFixed(2)),
    platformScore,
    metrics: normalized,
  };
}

const resolveClipLearningMetadata = (postData = {}, contentData = {}) =>
  postData.clipLearning ||
  postData.payload?.clipLearning ||
  postData.payload?.meta?.clipLearning ||
  contentData.clipLearning ||
  contentData.meta?.clipLearning ||
  null;

const buildGroupWeights = (outcomes, selector) => {
  const groups = new Map();
  outcomes.forEach(outcome => {
    const key = normalizeToken(selector(outcome));
    if (key === "unknown") return;
    const weight = clamp(outcome.sampleWeight, 0.05, 1);
    const current = groups.get(key) || { weightedScore: 0, weight: 0, samples: 0 };
    current.weightedScore += clamp(outcome.outcomeScore, 0, 100) * weight;
    current.weight += weight;
    current.samples += 1;
    groups.set(key, current);
  });

  const result = {};
  groups.forEach((group, key) => {
    const priorWeight = 2.5;
    const posteriorMean = (group.weightedScore + 50 * priorWeight) / (group.weight + priorWeight);
    result[key] = {
      multiplier: Number(clamp(1 + (posteriorMean - 50) / 250, 0.85, 1.15).toFixed(4)),
      outcomeMean: Number(posteriorMean.toFixed(2)),
      samples: group.samples,
      effectiveSamples: Number(group.weight.toFixed(2)),
    };
  });
  return result;
};

function buildClipLearningProfile(uid, outcomes = []) {
  const valid = outcomes
    .filter(outcome => Number.isFinite(Number(outcome.outcomeScore)))
    .slice(0, MAX_PROFILE_OUTCOMES);
  const effectiveSamples = valid.reduce(
    (sum, outcome) => sum + clamp(outcome.sampleWeight, 0.05, 1),
    0
  );
  const weightedOutcome = valid.reduce(
    (sum, outcome) => sum + outcome.outcomeScore * clamp(outcome.sampleWeight, 0.05, 1),
    0
  );
  const outcomeMean = effectiveSamples > 0 ? weightedOutcome / effectiveSamples : 50;

  return {
    version: PROFILE_VERSION,
    uid,
    status: valid.length >= 3 ? "active" : "warming_up",
    sampleCount: valid.length,
    effectiveSamples: Number(effectiveSamples.toFixed(2)),
    confidence: Number(clamp(effectiveSamples / 20, 0, 1).toFixed(3)),
    outcomeMean: Number(outcomeMean.toFixed(2)),
    strategyWeights: buildGroupWeights(valid, outcome => outcome.features?.strategyLabel),
    contentTypeWeights: buildGroupWeights(valid, outcome => outcome.features?.contentType),
    durationWeights: buildGroupWeights(valid, outcome => outcome.features?.durationBucket),
    platformWeights: buildGroupWeights(valid, outcome => outcome.platform),
    updatedAt: new Date().toISOString(),
  };
}

async function getClipLearningProfile(uid) {
  if (!uid) return null;
  const snapshot = await db.collection("clip_learning_profiles").doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function recomputeClipLearningProfile(uid) {
  if (!uid) return null;
  const snapshot = await db
    .collection("clip_outcomes")
    .where("uid", "==", uid)
    .limit(MAX_PROFILE_OUTCOMES)
    .get();
  const outcomes = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  const profile = buildClipLearningProfile(uid, outcomes);
  await db.collection("clip_learning_profiles").doc(uid).set(
    {
      ...profile,
      updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return profile;
}

async function recordClipOutcomeFromPlatformPost({ postId, postData = {}, snapshot, normalizedScore }) {
  if (!postId || !postData.uid || !postData.contentId || !snapshot) return null;
  const contentSnapshot = await db.collection("content").doc(postData.contentId).get();
  const contentData = contentSnapshot.exists ? contentSnapshot.data() || {} : {};
  const clipLearning = resolveClipLearningMetadata(postData, contentData);
  if (!clipLearning?.clipId && !clipLearning?.scanSessionId) return null;

  const duration = toNumber(
    clipLearning.duration,
    Number(clipLearning.end || 0) - Number(clipLearning.start || 0),
    contentData.duration,
    contentData.meta?.duration
  );
  const score = calculateClipOutcomeScore({
    metrics: snapshot,
    normalizedPlatformScore: normalizedScore,
    duration,
  });
  const outcome = {
    uid: postData.uid,
    contentId: postData.contentId,
    platformPostId: postId,
    platform: normalizeToken(postData.platform),
    externalId: postData.externalId || null,
    scanSessionId: clipLearning.scanSessionId || null,
    clipId: String(clipLearning.clipId || ""),
    predictedScore: toNumber(clipLearning.predictedScore, clipLearning.viralScore),
    scoreConfidence: toNumber(clipLearning.scoreConfidence),
    features: {
      strategyLabel: normalizeToken(clipLearning.strategyLabel),
      contentType: normalizeToken(clipLearning.contentType),
      durationBucket: durationBucket(duration),
      duration: Number(duration.toFixed(2)),
      scoreBreakdown: clipLearning.scoreBreakdown || null,
    },
    ...score,
    updatedAt: new Date().toISOString(),
    updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("clip_outcomes").doc(postId).set(outcome, { merge: true });
  const profile = await recomputeClipLearningProfile(postData.uid);
  return { outcome, profile };
}

module.exports = {
  buildClipLearningProfile,
  calculateClipOutcomeScore,
  durationBucket,
  getClipLearningProfile,
  normalizeOutcomeMetrics,
  recordClipOutcomeFromPlatformPost,
  recomputeClipLearningProfile,
  resolveClipLearningMetadata,
};
