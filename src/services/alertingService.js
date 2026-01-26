// alertingService.js - outbound operational alerts (webhook / Slack)
const { getConfig } = require("./configService");
const { db } = require("../firebaseAdmin");

async function postJson(url, body) {
  try {
    const payload = JSON.stringify(body);
    const fetchFn = typeof fetch !== "undefined" ? fetch : require("node-fetch");
    const resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    return { ok: resp.status >= 200 && resp.status < 300, status: resp.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendAlert({ type, message, severity = "info", meta = {} }) {
  try {
    const cfg = await getConfig();
    const a = cfg.alerting || {};
    if (a.enabledEvents && Array.isArray(a.enabledEvents) && !a.enabledEvents.includes(type))
      return { skipped: true, reason: "disabled_event" };
    if (!a.webhookUrl && !a.slackWebhookUrl) return { skipped: true, reason: "no_destination" };
    // Basic in-memory throttle (default 10 min) per alert type
    const throttleMs = a.throttleMinutes ? a.throttleMinutes * 60000 : 600000;
    if (!global.__alertLastSent) global.__alertLastSent = {};
    const last = global.__alertLastSent[type] || 0;
    const nowMs = Date.now();
    if (nowMs - last < throttleMs) {
      return { skipped: true, reason: "throttled", nextAllowedInMs: throttleMs - (nowMs - last) };
    }
    const at = new Date().toISOString();
    const alertDoc = { type, message, severity, meta, at };
    try {
      await db.collection("events").add({ ...alertDoc, eventType: "alert" });
    } catch (_) {}
    if (a.webhookUrl) await postJson(a.webhookUrl, alertDoc);
    if (a.slackWebhookUrl)
      await postJson(a.slackWebhookUrl, {
        text: `*[${severity.toUpperCase()}]* ${type}: ${message}\n\n${Object.keys(meta || {}).length ? "```" + JSON.stringify(meta, null, 2) + "```" : ""}`,
      });
    global.__alertLastSent[type] = nowMs;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkExplorationDrift() {
  try {
    const cfg = await getConfig();
    const target = cfg.banditExplorationTarget || 0.25;
    const tol = cfg.banditExplorationTolerance || 0.05;
    const snap = await db
      .collection("bandit_selection_metrics")
      .orderBy("at", "desc")
      .limit(300)
      .get();
    if (snap.empty) return { skipped: true };
    let total = 0,
      explored = 0;
    snap.forEach(d => {
      const v = d.data();
      total++;
      if (v.exploration) explored++;
    });
    const ratio = total ? explored / total : 0;
    const diff = Math.abs(ratio - target);
    if (diff > tol * 2) {
      await sendAlert({
        type: "exploration_drift",
        severity: "warning",
        message: `Exploration ratio ${ratio.toFixed(3)} outside target ${target} (tol ${tol})`,
        meta: { ratio, target, tol, total },
      });
      return { alerted: true, ratio };
    }
    return { ok: true, ratio };
  } catch (e) {
    return { error: e.message };
  }
}

async function checkDiversity() {
  try {
    const cfg = await getConfig();
    const minRatio = (cfg.alerting && cfg.alerting.minDiversityRatio) || 0.15;
    const snap = await db.collection("variant_stats").orderBy("updatedAt", "desc").limit(200).get();
    if (snap.empty) return { skipped: true };
    let activeSet = new Set();
    let total = 0;
    snap.forEach(d => {
      const v = d.data();
      if (!v.platforms) return;
      Object.values(v.platforms).forEach(p =>
        (p.variants || []).forEach(row => {
          total++;
          if (!row.suppressed && !row.quarantined) activeSet.add(row.value);
        })
      );
    });
    const diversityRatio = total ? activeSet.size / total : 0;
    if (diversityRatio < minRatio) {
      await sendAlert({
        type: "variant_diversity_low",
        severity: "warning",
        message: `Variant diversity low ${(diversityRatio * 100).toFixed(1)}% (< ${(minRatio * 100).toFixed(1)}%)`,
        meta: { diversityRatio, activeUnique: activeSet.size, total },
      });
      return { alerted: true, diversityRatio };
    }
    return { ok: true, diversityRatio };
  } catch (e) {
    return { error: e.message };
  }
}

async function recordRollbackAlert({ reason, dropPct, manual }) {
  const severity = reason === "ctr_drop" ? "critical" : "warning";
  await sendAlert({
    type: manual ? "bandit_manual_rollback" : "bandit_auto_rollback",
    severity,
    message: `Bandit weights rollback (${manual ? "manual" : "auto"}): ${reason}`,
    meta: { reason, dropPct, manual },
  });
}

async function recordEmailFailure(meta) {
  await sendAlert({
    type: "email_delivery_failure",
    severity: "warning",
    message: "Email provider failure",
    meta,
  });
}

async function checkTikTokMetrics() {
  try {
    const cfg = await getConfig();
    const keys = [
      "tiktok.publish.success",
      "tiktok.publish.failure",
      "tiktok.upload.fallback.file_upload",
      "tiktok.enqueue.skipped.disabled",
      "tiktok.enqueue.succeeded",
    ];
    const snaps = await Promise.all(keys.map(k => db.collection("system_counters").doc(k).get()));
    const current = {};
    keys.forEach((k, i) => {
      current[k] = snaps[i].exists ? snaps[i].data().value || 0 : 0;
    });

    if (!global.__tiktokLastSnapshot) {
      global.__tiktokLastSnapshot = { ts: Date.now(), counters: current };
      return { skipped: true };
    }

    const prev = global.__tiktokLastSnapshot.counters;
    const periodMs = Date.now() - global.__tiktokLastSnapshot.ts;
    const delta = {};
    keys.forEach(k => {
      delta[k] = (current[k] || 0) - (prev[k] || 0);
    });
    global.__tiktokLastSnapshot = { ts: Date.now(), counters: current };

    // Publish failure rate alert
    const publishes =
      (delta["tiktok.publish.success"] || 0) + (delta["tiktok.publish.failure"] || 0);
    const minSamples = (cfg.alerting && cfg.alerting.tiktokPublishMinSamples) || 10;
    const failThreshold = (cfg.alerting && cfg.alerting.tiktokPublishFailureRateThreshold) || 0.1;
    if (publishes >= minSamples) {
      const failureRate = (delta["tiktok.publish.failure"] || 0) / publishes;
      if (failureRate >= failThreshold) {
        await sendAlert({
          type: "tiktok_publish_failure_rate_high",
          severity: "warning",
          message: `TikTok publish failure rate ${(failureRate * 100).toFixed(1)}% over last ${Math.round(periodMs / 1000)}s`,
          meta: { failureRate, publishes, periodMs, delta },
        });
        return { alerted: true, failureRate, publishes };
      }
    }

    // File upload fallback alert
    const enqueues = delta["tiktok.enqueue.succeeded"] || 0;
    const fallbacks = delta["tiktok.upload.fallback.file_upload"] || 0;
    const minEnqueues = (cfg.alerting && cfg.alerting.tiktokFallbackMinEnqueues) || 10;
    const fallbackThreshold = (cfg.alerting && cfg.alerting.tiktokFallbackRatioThreshold) || 0.2;
    const minFallbackCount = (cfg.alerting && cfg.alerting.tiktokFallbackMinCount) || 5;
    if (enqueues >= minEnqueues && fallbacks >= minFallbackCount) {
      const fallbackRatio = enqueues ? fallbacks / enqueues : 0;
      if (fallbackRatio >= fallbackThreshold) {
        await sendAlert({
          type: "tiktok_upload_fallback_high",
          severity: "warning",
          message: `TikTok upload fallback ratio ${(fallbackRatio * 100).toFixed(1)}% (${fallbacks}/${enqueues}) over last ${Math.round(periodMs / 1000)}s`,
          meta: { fallbacks, enqueues, periodMs, delta },
        });
        return { alerted: true, fallbackRatio, fallbacks, enqueues };
      }
    }

    return { ok: true, delta, periodMs };
  } catch (e) {
    return { error: e.message };
  }
}

async function runAlertChecks() {
  const r1 = await checkExplorationDrift();
  const r2 = await checkDiversity();
  const r3 = await checkTikTokMetrics();
  return { exploration: r1, diversity: r2, tiktok: r3 };
}

module.exports = {
  sendAlert,
  checkExplorationDrift,
  checkDiversity,
  runAlertChecks,
  recordRollbackAlert,
  recordEmailFailure,
};
