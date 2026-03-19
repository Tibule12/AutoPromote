const { db, admin } = require("../firebaseAdmin");
const optimizationService = require("../optimizationService");
const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
const { getOrGenerateVariants } = require("./optimizationService");
const { incrCounter } = require("./metricsRecorder");
const { getConfig, updateConfig } = require("./configService");

const DEFAULT_POLICY = {
  enabled: false,
  cadenceHours: 24,
  minHealthScore: 45,
  maxDailyRuns: 2,
  cooldownHours: 6,
  dryRunOnly: false,
  allowedActions: ["variant_generation", "redistribution", "budget_tuning"],
};

const DEFAULT_AUTOMATION_CONFIG = {
  enabled: true,
  rolloutPercent: 100,
  canaryUserIds: [],
  killSwitch: false,
  disableReason: null,
  updatedAt: null,
  updatedBy: null,
};

const MAX_REMEDIATION_ACTIONS = Math.max(
  1,
  Math.min(20, Number(process.env.DIAGNOSIS_MAX_ACTIONS_PER_RUN || 8))
);
const MAX_DUE_POLICY_ITEMS_PER_RUN = Math.max(
  1,
  Math.min(500, Number(process.env.DIAGNOSIS_MAX_CONTENTS_PER_RUN || 50))
);

function parseEnvFlag(name, fallback) {
  if (process.env[name] === undefined) return fallback;
  return String(process.env[name]).toLowerCase() === "true";
}

function parseEnvInt(name, fallback) {
  const n = Number(process.env[name]);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.floor(n)));
  return fallback;
}

function normalizeAutomationConfig(raw = {}) {
  const rolloutPercent = Math.max(0, Math.min(100, Number(raw.rolloutPercent ?? 100)));
  return {
    enabled: Boolean(raw.enabled),
    rolloutPercent,
    canaryUserIds: Array.isArray(raw.canaryUserIds)
      ? raw.canaryUserIds.map(v => String(v).trim()).filter(Boolean)
      : [],
    killSwitch: Boolean(raw.killSwitch),
    disableReason: raw.disableReason ? String(raw.disableReason) : null,
    updatedAt: toIso(raw.updatedAt),
    updatedBy: raw.updatedBy || null,
  };
}

function stablePercentSeed(input = "") {
  let hash = 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

async function getRecoveryAutomationConfig({ force = false } = {}) {
  const cfg = await getConfig(force);
  const envEnabled = parseEnvFlag("DIAGNOSIS_AUTORECOVERY_ENABLED", true);
  const envRollout = parseEnvInt("DIAGNOSIS_AUTORECOVERY_ROLLOUT_PERCENT", 100);
  const envKillSwitch = parseEnvFlag("DIAGNOSIS_AUTORECOVERY_KILL_SWITCH", false);

  const stored = normalizeAutomationConfig(
    cfg && cfg.recoveryAutomation ? cfg.recoveryAutomation : DEFAULT_AUTOMATION_CONFIG
  );

  return {
    ...stored,
    enabled: envEnabled && stored.enabled,
    rolloutPercent: Math.min(stored.rolloutPercent, envRollout),
    killSwitch: envKillSwitch || stored.killSwitch,
  };
}

async function setRecoveryAutomationConfig({ patch = {}, actorUid = null } = {}) {
  const cfg = await getConfig(true);
  const current = normalizeAutomationConfig(
    cfg && cfg.recoveryAutomation ? cfg.recoveryAutomation : DEFAULT_AUTOMATION_CONFIG
  );
  const next = normalizeAutomationConfig({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUid || null,
  });

  await updateConfig({ recoveryAutomation: next });
  await incrCounter("diagnosis_automation_config_updates");
  return getRecoveryAutomationConfig({ force: true });
}

async function disableRecoveryAutomation({ actorUid = null, reason = "manual_disable" } = {}) {
  const next = await setRecoveryAutomationConfig({
    patch: {
      enabled: false,
      killSwitch: true,
      disableReason: String(reason || "manual_disable"),
    },
    actorUid,
  });
  await incrCounter("diagnosis_automation_kill_switch");
  return next;
}

function shouldIncludeByRollout({ contentId, uid, rolloutPercent, canaryUserIds = [] } = {}) {
  const canarySet = new Set((canaryUserIds || []).map(v => String(v)));
  if (uid && canarySet.has(String(uid))) return true;
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  const seed = stablePercentSeed(`${uid || "no_uid"}:${contentId || "no_content"}`);
  return seed < rolloutPercent;
}

function dedupeActions(actions = []) {
  const seen = new Set();
  const out = [];
  for (const action of actions) {
    const key = `${String(action.type || "").toLowerCase()}::${String(action.platform || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

async function acquirePolicyLock({ contentId, ownerId, ttlSec = 120 }) {
  const lockId = `diagnosis_policy_${String(contentId)}`;
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + Number(ttlSec) * 1000).toISOString();
  const ref = db.collection("system_locks").doc(lockId);

  try {
    const acquired = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data() || {};
        const lockExpires = Date.parse(toIso(data.expiresAt) || "");
        if (Number.isFinite(lockExpires) && lockExpires > nowMs && data.ownerId !== ownerId) {
          return false;
        }
      }

      tx.set(
        ref,
        {
          lockId,
          contentId: String(contentId),
          ownerId,
          acquiredAt: new Date(nowMs).toISOString(),
          expiresAt,
        },
        { merge: true }
      );
      return true;
    });
    return { acquired, ref };
  } catch (_) {
    return { acquired: false, ref };
  }
}

async function releasePolicyLock(ref, ownerId) {
  if (!ref) return;
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (data.ownerId && String(data.ownerId) !== String(ownerId)) return;
      tx.delete(ref);
    });
  } catch (_) {
    // Best effort; TTL expiry still prevents permanent lockout.
  }
}

async function recordPolicyEvent({
  event,
  contentId = null,
  actorUid = null,
  dryRun = false,
  reason = null,
  details = null,
} = {}) {
  if (!event) return;
  try {
    const createdAt = new Date().toISOString();
    await db.collection("diagnosis_policy_events").add({
      event: String(event),
      contentId: contentId ? String(contentId) : null,
      actorUid: actorUid || null,
      dryRun: Boolean(dryRun),
      reason: reason ? String(reason) : null,
      details: details || null,
      createdAt,
      createdAtTs: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {
    // Telemetry must never fail the core workflow.
  }
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function getPolicySafetyDashboard({ hours = 24, limit = 500 } = {}) {
  const safeHours = Math.max(1, Math.min(168, Number(hours || 24)));
  const safeLimit = Math.max(50, Math.min(2000, Number(limit || 500)));
  const cutoff = new Date(Date.now() - safeHours * 3600000).toISOString();

  const snap = await db
    .collection("diagnosis_policy_events")
    .where("createdAt", ">=", cutoff)
    .orderBy("createdAt", "desc")
    .limit(safeLimit)
    .get()
    .catch(() => ({ empty: true, docs: [] }));

  const events = snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const breakdown = {};
  for (const evt of events) {
    const key = String(evt.event || "unknown");
    breakdown[key] = (breakdown[key] || 0) + 1;
  }

  const runExecuted = Number(breakdown.run_executed || 0);
  const runSkippedLockBusy = Number(breakdown.run_skipped_lock_busy || 0);
  const runItemError = Number(breakdown.run_item_error || 0);
  const attempts =
    runExecuted +
    runSkippedLockBusy +
    runItemError +
    Number(breakdown.run_skipped_cooldown || 0) +
    Number(breakdown.run_skipped_daily_cap || 0) +
    Number(breakdown.run_skipped_health || 0);

  const recent = events.slice(0, 20).map(e => ({
    id: e.id,
    event: e.event,
    contentId: e.contentId || null,
    reason: e.reason || null,
    dryRun: Boolean(e.dryRun),
    createdAt: e.createdAt,
  }));

  return {
    windowHours: safeHours,
    since: cutoff,
    sampledEvents: events.length,
    limits: {
      maxItemsPerRun: MAX_DUE_POLICY_ITEMS_PER_RUN,
      maxActionsPerRun: MAX_REMEDIATION_ACTIONS,
    },
    counters: {
      attempts,
      runExecuted,
      runSkippedLockBusy,
      runItemError,
    },
    rates: {
      lockContentionRatePct: pct(runSkippedLockBusy, attempts),
      itemErrorRatePct: pct(runItemError, attempts),
      executionRatePct: pct(runExecuted, attempts),
    },
    breakdown,
    recent,
  };
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value.toMillis) return new Date(value.toMillis()).toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizePolicy(input = {}) {
  const cadenceHours = Math.max(
    1,
    Math.min(168, Number(input.cadenceHours || DEFAULT_POLICY.cadenceHours))
  );
  const minHealthScore = Math.max(
    0,
    Math.min(100, Number(input.minHealthScore || DEFAULT_POLICY.minHealthScore))
  );
  const maxDailyRuns = Math.max(
    1,
    Math.min(10, Number(input.maxDailyRuns || DEFAULT_POLICY.maxDailyRuns))
  );
  const cooldownHours = Math.max(
    1,
    Math.min(48, Number(input.cooldownHours || DEFAULT_POLICY.cooldownHours))
  );
  const allowedActions = Array.isArray(input.allowedActions)
    ? input.allowedActions.filter(Boolean)
    : DEFAULT_POLICY.allowedActions;

  return {
    enabled: Boolean(input.enabled),
    cadenceHours,
    minHealthScore,
    maxDailyRuns,
    cooldownHours,
    dryRunOnly: Boolean(input.dryRunOnly),
    allowedActions: allowedActions.length ? allowedActions : DEFAULT_POLICY.allowedActions,
  };
}

function nextRunAtFromNow(policy) {
  return new Date(
    Date.now() + Number(policy.cadenceHours || DEFAULT_POLICY.cadenceHours) * 3600000
  ).toISOString();
}

function isWithinCooldown(lastAutoRunAt, cooldownHours) {
  const iso = toIso(lastAutoRunAt);
  if (!iso) return false;
  return Date.now() - Date.parse(iso) < cooldownHours * 3600000;
}

function dailyCountForToday(state = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.date !== today) return 0;
  return Number(state.runs || 0);
}

function filterAllowedActions(actions = [], allowed = []) {
  const allowSet = new Set((allowed || []).map(a => String(a).trim().toLowerCase()));
  if (!allowSet.size) return actions;
  return actions.filter(a => allowSet.has(String(a.type || "").toLowerCase()));
}

async function getContent(contentId) {
  const snap = await db.collection("content").doc(String(contentId)).get();
  if (!snap.exists) {
    const err = new Error("Content not found");
    err.code = "not_found";
    throw err;
  }
  return { id: snap.id, ...snap.data() };
}

async function getLatestAnalytics(contentId) {
  const snap = await db
    .collection("analytics")
    .where("content_id", "==", String(contentId))
    .orderBy("metrics_updated_at", "desc")
    .limit(1)
    .get()
    .catch(() => ({ empty: true, docs: [] }));

  if (snap.empty) return {};
  return snap.docs[0].data() || {};
}

function buildDiagnosisDocument({ content, diagnostics, analytics, trigger, actorUid }) {
  const nowIso = new Date().toISOString();
  return {
    contentId: content.id,
    uid: content.user_id || content.userId || null,
    status: diagnostics.diagnosis.status,
    healthScore: diagnostics.diagnosis.healthScore,
    issues: diagnostics.diagnosis.issues,
    recommendations: diagnostics.recommendations,
    snapshot: diagnostics.snapshot,
    analyticsSample: {
      views: analytics.views || 0,
      engagements: analytics.engagements || 0,
      revenue: analytics.revenue || 0,
      cost: analytics.cost || 0,
      roi: analytics.roi || 0,
    },
    trigger: trigger || "manual",
    actorUid: actorUid || null,
    updatedAt: nowIso,
  };
}

async function persistDiagnosis({ contentId, diagnostics, analytics, trigger, actorUid }) {
  const content = await getContent(contentId);
  const ref = db.collection("content_diagnosis").doc(String(contentId));
  const docData = buildDiagnosisDocument({
    content,
    diagnostics,
    analytics,
    trigger,
    actorUid,
  });

  await ref.set(
    {
      ...docData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtTs: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db
    .collection("content")
    .doc(String(contentId))
    .set(
      {
        diagnosis: {
          status: docData.status,
          healthScore: docData.healthScore,
          topIssueTypes: (docData.issues || []).slice(0, 3).map(i => i.type),
          updatedAt: docData.updatedAt,
          needsAttention: docData.status !== "healthy",
        },
      },
      { merge: true }
    );

  return docData;
}

async function diagnoseContent({
  contentId,
  forceRefresh = false,
  trigger = "manual",
  actorUid,
} = {}) {
  if (!forceRefresh) {
    const existing = await db.collection("content_diagnosis").doc(String(contentId)).get();
    if (existing.exists) return { contentId: String(contentId), ...existing.data(), cached: true };
  }

  const content = await getContent(contentId);
  const analytics = await getLatestAnalytics(contentId);
  const diagnostics = optimizationService.diagnoseContentPerformance(content, analytics);
  const persisted = await persistDiagnosis({
    contentId,
    diagnostics,
    analytics,
    trigger,
    actorUid,
  });

  await incrCounter("diagnosis_compute_success");

  return { ...persisted, cached: false };
}

async function getDiagnosisPolicy(contentId) {
  const snap = await db.collection("content_diagnosis").doc(String(contentId)).get();
  if (!snap.exists) {
    return {
      contentId: String(contentId),
      policy: { ...DEFAULT_POLICY },
      policyState: { runs: 0, date: null },
      nextRunAt: null,
    };
  }
  const data = snap.data() || {};
  return {
    contentId: String(contentId),
    policy: normalizePolicy(data.autoPolicy || DEFAULT_POLICY),
    policyState: data.policyState || { runs: 0, date: null },
    nextRunAt: data.nextRunAt || null,
    lastAutoRunAt: toIso(data.lastAutoRunAt),
  };
}

async function setDiagnosisPolicy({ contentId, policy = {}, actorUid } = {}) {
  const normalized = normalizePolicy(policy);
  const ref = db.collection("content_diagnosis").doc(String(contentId));
  const nextRunAt = normalized.enabled ? nextRunAtFromNow(normalized) : null;

  await ref.set(
    {
      contentId: String(contentId),
      autoPolicy: normalized,
      nextRunAt,
      policyUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      policyUpdatedBy: actorUid || null,
    },
    { merge: true }
  );

  await db
    .collection("content")
    .doc(String(contentId))
    .set(
      {
        diagnosisPolicy: {
          enabled: normalized.enabled,
          cadenceHours: normalized.cadenceHours,
          dryRunOnly: normalized.dryRunOnly,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );

  return {
    contentId: String(contentId),
    policy: normalized,
    nextRunAt,
  };
}

async function listRemediationHistory({
  contentId,
  limit = 10,
  type = null,
  status = null,
  actorUid = null,
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 10)));
  let rows = [];
  const base = db
    .collection("content_recovery_actions")
    .where("contentId", "==", String(contentId));
  let snap = await base
    .orderBy("executedAt", "desc")
    .limit(safeLimit * 3)
    .get()
    .catch(() => null);

  if (!snap) {
    snap = await base
      .limit(safeLimit * 3)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
  }
  rows = snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (actorUid) rows = rows.filter(r => String(r.actorUid || "") === String(actorUid));
  if (type) {
    const t = String(type).toLowerCase();
    rows = rows.filter(
      r => Array.isArray(r.actions) && r.actions.some(a => String(a.type || "").toLowerCase() === t)
    );
  }
  if (status) {
    const s = String(status).toLowerCase();
    rows = rows.filter(
      r =>
        String(r.diagnosisStatus || "").toLowerCase() === s ||
        (Array.isArray(r.actions) &&
          r.actions.some(a => String(a.status || "").toLowerCase() === s))
    );
  }

  rows.sort((a, b) => String(b.executedAt || "").localeCompare(String(a.executedAt || "")));
  return rows.slice(0, safeLimit);
}

async function triggerRemediation({
  contentId,
  actorUid,
  dryRun = false,
  source = "manual",
  policy = null,
} = {}) {
  const content = await getContent(contentId);
  const diagnosis = await diagnoseContent({
    contentId,
    forceRefresh: true,
    trigger: "remediation",
    actorUid,
  });

  const uid = content.user_id || content.userId || null;
  const issues = Array.isArray(diagnosis.issues) ? diagnosis.issues : [];
  const actions = [];

  if (issues.some(i => i.type === "hook" || i.type === "creative_depth")) {
    if (dryRun) {
      actions.push({ type: "variant_generation", status: "planned" });
    } else {
      const generated = await getOrGenerateVariants({
        contentId: String(contentId),
        uid,
        baseMessage: content.title || content.description || "New content",
        tags: content.hashtags || [],
      });
      actions.push({
        type: "variant_generation",
        status: "completed",
        variantCount: Array.isArray(generated) ? generated.length : 0,
      });
    }
  }

  if (issues.some(i => i.type === "distribution")) {
    const platforms = Array.isArray(content.target_platforms)
      ? content.target_platforms.filter(Boolean).slice(0, 2)
      : [];
    if (platforms.length === 0) {
      actions.push({
        type: "redistribution",
        status: "skipped",
        reason: "no_target_platforms",
      });
    } else {
      for (const platform of platforms) {
        if (dryRun) {
          actions.push({ type: "redistribution", status: "planned", platform });
          continue;
        }
        const queued = await enqueuePlatformPostTask({
          contentId: String(contentId),
          uid,
          platform,
          reason: "diagnosis_distribution_recovery",
          payload: {
            diagnosisStatus: diagnosis.status,
            source: "content_recovery_service",
          },
          skipIfDuplicate: true,
        });
        actions.push({
          type: "redistribution",
          status: queued && queued.skipped ? "skipped" : "queued",
          platform,
          taskId: queued && queued.id ? queued.id : null,
          reason: queued && queued.reason ? queued.reason : null,
        });
      }
    }
  }

  if (issues.some(i => i.type === "monetization")) {
    const currentBudget = Number(content?.optimizedPromotionSettings?.budget || 0);
    const recommendedBudget =
      currentBudget > 0 ? Math.max(1, Math.round(currentBudget * 0.85)) : null;
    actions.push({
      type: "budget_tuning",
      status: "recommended",
      currentBudget,
      recommendedBudget,
    });
  }

  const effectiveActions = filterAllowedActions(actions, policy && policy.allowedActions);
  const boundedActions = dedupeActions(effectiveActions).slice(0, MAX_REMEDIATION_ACTIONS);

  if (source === "auto" && policy && policy.enabled) {
    if (diagnosis.healthScore >= Number(policy.minHealthScore || DEFAULT_POLICY.minHealthScore)) {
      return {
        contentId: String(contentId),
        uid,
        diagnosisStatus: diagnosis.status,
        healthScore: diagnosis.healthScore,
        dryRun,
        actions: [],
        skipped: true,
        skipReason: "health_above_threshold",
        policy,
        executedAt: new Date().toISOString(),
      };
    }
  }

  const result = {
    contentId: String(contentId),
    uid,
    diagnosisStatus: diagnosis.status,
    healthScore: diagnosis.healthScore,
    dryRun,
    actions: boundedActions,
    executedAt: new Date().toISOString(),
    actorUid: actorUid || null,
    source,
    policySnapshot: policy || null,
  };

  if (!dryRun) {
    await db.collection("content_diagnosis").doc(String(contentId)).set(
      {
        lastRemediation: result,
        lastRemediatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await db.collection("content_recovery_actions").add(result);
    await incrCounter("diagnosis_remediation_executed");
  }

  return result;
}

async function runDuePolicies({
  limit = 20,
  actorUid = null,
  dryRun = false,
  contentIds = null,
} = {}) {
  const requestedLimit = Math.max(1, Number(limit || 20));
  const safeLimit = Math.max(1, Math.min(MAX_DUE_POLICY_ITEMS_PER_RUN, requestedLimit));
  const now = new Date();
  const nowIso = now.toISOString();

  const dueSnap = await db
    .collection("content_diagnosis")
    .where("autoPolicy.enabled", "==", true)
    .limit(safeLimit * 3)
    .get()
    .catch(() => ({ empty: true, docs: [] }));

  const automation = await getRecoveryAutomationConfig();
  if (!automation.enabled || automation.killSwitch) {
    await incrCounter("diagnosis_policy_run_blocked");
    await recordPolicyEvent({
      event: "run_blocked",
      actorUid,
      dryRun,
      reason: automation.killSwitch ? "kill_switch" : "automation_disabled",
      details: { requestedLimit, effectiveLimit: safeLimit },
    });
    return {
      processedCount: 0,
      processed: [],
      dryRun,
      runAt: nowIso,
      blocked: true,
      blockReason: automation.killSwitch ? "kill_switch" : "automation_disabled",
      automation,
      requestedLimit,
      effectiveLimit: safeLimit,
      maxPerRun: MAX_DUE_POLICY_ITEMS_PER_RUN,
      capApplied: requestedLimit > safeLimit,
    };
  }

  const targeted = Array.isArray(contentIds) ? new Set(contentIds.map(id => String(id))) : null;

  const candidates = dueSnap.empty
    ? []
    : dueSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => {
          if (targeted && !targeted.has(String(d.contentId || d.id))) return false;
          const uid = d.uid || d.userId || d.user_id || null;
          if (
            !shouldIncludeByRollout({
              contentId: d.contentId || d.id,
              uid,
              rolloutPercent: automation.rolloutPercent,
              canaryUserIds: automation.canaryUserIds,
            })
          ) {
            return false;
          }
          const nextRunAt = toIso(d.nextRunAt);
          return !nextRunAt || Date.parse(nextRunAt) <= now.getTime();
        });

  const processed = [];

  for (const item of candidates.slice(0, safeLimit)) {
    const contentId = item.contentId || item.id;
    const runOwnerId = `runDue:${actorUid || "system"}:${Date.now()}:${contentId}`;
    const lock = await acquirePolicyLock({ contentId, ownerId: runOwnerId });
    if (!lock.acquired) {
      await incrCounter("diagnosis_policy_run_skipped_lock_busy");
      await recordPolicyEvent({
        event: "run_skipped_lock_busy",
        contentId,
        actorUid,
        dryRun,
        reason: "lock_busy",
      });
      processed.push({ contentId, skipped: true, reason: "lock_busy" });
      continue;
    }

    try {
      const policy = normalizePolicy(item.autoPolicy || DEFAULT_POLICY);
      const state = item.policyState || { runs: 0, date: null };
      const runsToday = dailyCountForToday(state);

      if (runsToday >= Number(policy.maxDailyRuns || DEFAULT_POLICY.maxDailyRuns)) {
        await incrCounter("diagnosis_policy_run_skipped_daily_cap");
        await recordPolicyEvent({
          event: "run_skipped_daily_cap",
          contentId,
          actorUid,
          dryRun,
          reason: "daily_cap",
          details: {
            runsToday,
            maxDailyRuns: Number(policy.maxDailyRuns || DEFAULT_POLICY.maxDailyRuns),
          },
        });
        processed.push({ contentId, skipped: true, reason: "daily_cap" });
        continue;
      }

      if (
        isWithinCooldown(
          item.lastAutoRunAt,
          Number(policy.cooldownHours || DEFAULT_POLICY.cooldownHours)
        )
      ) {
        await incrCounter("diagnosis_policy_run_skipped_cooldown");
        await recordPolicyEvent({
          event: "run_skipped_cooldown",
          contentId,
          actorUid,
          dryRun,
          reason: "cooldown",
        });
        processed.push({ contentId, skipped: true, reason: "cooldown" });
        continue;
      }

      const executeDryRun = dryRun || policy.dryRunOnly;
      const run = await triggerRemediation({
        contentId,
        actorUid,
        dryRun: executeDryRun,
        source: "auto",
        policy,
      });

      processed.push(run);

      if (!executeDryRun && !run.skipped) {
        const today = new Date().toISOString().slice(0, 10);
        const nextRuns = state.date === today ? Number(state.runs || 0) + 1 : 1;
        await db
          .collection("content_diagnosis")
          .doc(String(contentId))
          .set(
            {
              lastAutoRunAt: admin.firestore.FieldValue.serverTimestamp(),
              nextRunAt: nextRunAtFromNow(policy),
              policyState: {
                date: today,
                runs: nextRuns,
              },
              lastPolicyRunBy: actorUid || null,
              lastPolicyRunAt: nowIso,
            },
            { merge: true }
          );
        await incrCounter("diagnosis_policy_run_executed");
        await recordPolicyEvent({
          event: "run_executed",
          contentId,
          actorUid,
          dryRun: executeDryRun,
          details: { actionCount: Array.isArray(run.actions) ? run.actions.length : 0 },
        });
      } else if (run.skipped) {
        await incrCounter("diagnosis_policy_run_skipped_health");
        await recordPolicyEvent({
          event: "run_skipped_health",
          contentId,
          actorUid,
          dryRun: executeDryRun,
          reason: run.skipReason || "health_above_threshold",
        });
      } else {
        await recordPolicyEvent({
          event: "run_executed",
          contentId,
          actorUid,
          dryRun: executeDryRun,
          details: { actionCount: Array.isArray(run.actions) ? run.actions.length : 0 },
        });
      }
    } catch (error) {
      await incrCounter("diagnosis_policy_run_item_error");
      await recordPolicyEvent({
        event: "run_item_error",
        contentId,
        actorUid,
        dryRun,
        reason: "item_error",
        details: { message: error.message },
      });
      processed.push({ contentId, skipped: true, reason: "item_error", error: error.message });
    } finally {
      await releasePolicyLock(lock.ref, runOwnerId);
    }
  }

  return {
    processedCount: processed.length,
    processed,
    dryRun,
    runAt: nowIso,
    automation,
    requestedLimit,
    effectiveLimit: safeLimit,
    maxPerRun: MAX_DUE_POLICY_ITEMS_PER_RUN,
    capApplied: requestedLimit > safeLimit,
  };
}

module.exports = {
  diagnoseContent,
  triggerRemediation,
  listRemediationHistory,
  getDiagnosisPolicy,
  setDiagnosisPolicy,
  runDuePolicies,
  getPolicySafetyDashboard,
  getRecoveryAutomationConfig,
  setRecoveryAutomationConfig,
  disableRecoveryAutomation,
};
