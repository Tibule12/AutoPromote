// Server-only renewable allowance and financial liability ledger. No legacy wallet writes.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { integer, fail } = require("../unifiedCredits/policy");
const { DAY, TOKEN_MICROS, processingPlan, quote } = require("./policy");
const key = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
function identifier(value) {
  if (typeof value !== "string" || !value || value.length > 160) fail("INVALID_IDENTIFIER");
  return value;
}
const blank = () => ({
  reservedMicros: 0,
  active: 0,
  days: {},
  months: {},
  freeDays: {},
  apiDays: {},
});
const DEFAULT_LIMITS = Object.freeze({
  dailyMicros: 1000000,
  monthlyMicros: 10000000,
  freeDailyMicros: 250000,
  apiDailyMicros: 100000,
  maxActive: 4,
  maxActiveUser: 1,
  maxEventsPerUser: 5000,
  maxAccountGrantsPerDay: 100,
  maxStorageBytes: 10737418240,
});

function createProcessingService({
  db,
  now = Date.now,
  limits = {},
  operations,
  entitlement,
  plans = processingPlan,
}) {
  const caps = { ...DEFAULT_LIMITS, ...limits };
  Object.entries(caps).forEach(([name, value]) => integer(value, name, 1));
  const ref = (collection, id) => db.collection(`processing_${collection}`).doc(id);
  const account = uid => ref("accounts", key(identifier(uid)));
  const control = ref("control", "global");
  const job = (uid, requestId) => ref("jobs", key(identifier(uid), identifier(requestId)));
  async function tier(tx, uid) {
    if (entitlement) return entitlement(tx, uid);
    const [billing, user] = await tx.getAll(
      db.collection("user_billing").doc(uid),
      db.collection("users").doc(uid)
    );
    const b = billing.data() || {},
      u = user.data() || {};
    const { resolveEffectiveTierId } = require("../billingService");
    return resolveEffectiveTierId(uid, b, u);
  }
  function renew(a, planId, time) {
    const p = plans(planId);
    if (!a)
      return {
        userId: null,
        planId,
        cycleStart: time,
        resetAt: time + p.resetHours * 3600000,
        cycleAllowance: p.tokens,
        used: 0,
        reservedMicros: 0,
        active: 0,
        history: [],
        storageBytes: 0,
      };
    if (time < a.cycleStart) fail("CLOCK_MOVED_BACKWARDS", 503);
    if (time >= a.resetAt) {
      const interval = p.resetHours * 3600000;
      const start = a.resetAt + Math.floor((time - a.resetAt) / interval) * interval;
      a.cycleStart = start;
      a.resetAt = start + interval;
      a.used = 0;
      a.cycleAllowance = p.tokens;
    } else if (p.tokens > a.cycleAllowance) {
      // A verified upgrade increases this cycle once; it cannot repeatedly refill it.
      a.cycleAllowance = p.tokens;
    }
    a.cycleAllowance = Math.min(a.cycleAllowance, p.tokens);
    if (a.planId !== planId) a.resetAt = Math.min(a.resetAt, time + p.resetHours * 3600000);
    a.planId = planId;
    a.history = a.history.filter(e => e.at > time - 30 * DAY);
    return a;
  }
  function summary(a, time) {
    const p = plans(a.planId);
    const spentMicros = a.history.reduce((sum, event) => sum + event.micros, 0);
    const remaining = Math.max(
      0,
      Math.min(
        a.cycleAllowance - a.used,
        Math.floor(
          (p.rolling30DayTokens * TOKEN_MICROS - spentMicros - a.reservedMicros) / TOKEN_MICROS
        )
      )
    );
    const cycleRemainingTokens = Math.max(0, a.cycleAllowance - a.used);
    const rollingRemainingTokens = Math.max(0, Math.floor(
      (p.rolling30DayTokens * TOKEN_MICROS - spentMicros - a.reservedMicros) / TOKEN_MICROS
    ));
    return {
      planId: a.planId,
      allowance: a.cycleAllowance,
      remaining,
      remainingPercent: Math.round((100 * remaining) / a.cycleAllowance),
      cycleRemainingTokens,
      rollingRemainingTokens,
      exhaustionReason: remaining > 0 ? null : cycleRemainingTokens === 0
        ? (rollingRemainingTokens === 0 ? "cycle_and_rolling" : "cycle") : "rolling",
      nextResetAt: new Date(a.resetAt).toISOString(),
      rolling30DayLimit: p.rolling30DayTokens,
      rollingSpentTokens: Math.ceil(spentMicros / TOKEN_MICROS),
      reservedTokens: Math.ceil(a.reservedMicros / TOKEN_MICROS),
      storage: {
        usedBytes: a.storageBytes,
        reservedBytes: a.storageReservedBytes || 0,
        limitBytes: p.storageBytes,
        measured: a.storageMeasured === true,
      },
      activeJobs: a.active,
      localEditingAvailable: true,
      provisional: true,
      rollingAvailableAt: a.history.length
        ? new Date(Math.min(...a.history.map(e => e.at)) + 30 * DAY).toISOString()
        : null,
      asOf: new Date(time).toISOString(),
    };
  }
  function validateGlobal(g) {
    if (!g?.enabled) fail("CLOUD_PROCESSING_PAUSED", 503);
  }
  async function load(tx, uid, requestId) {
    const refs = [account(uid), control, ...(requestId ? [job(uid, requestId)] : [])];
    const snaps = await tx.getAll(...refs);
    const planId = await tier(tx, uid);
    const time = now();
    const previousAccount = snaps[0].data();
    return {
      a: renew(previousAccount ? { ...previousAccount, history: [...previousAccount.history] } : null, planId, time),
      previousAccount,
      g: snaps[1].data(),
      existing: snaps[2]?.data(),
      time,
      fresh: !snaps[0].exists,
    };
  }
  return {
    quote: operation => quote(operation, operations),
    // Operator provisioning is deliberately not exposed through a user API.
    async configure({ enabled = false } = {}) {
      return db.runTransaction(async tx => {
        const current = await tx.get(control);
        tx.set(control, { ...blank(), ...(current.data() || {}), enabled });
      });
    },
    async status(uid) {
      return db.runTransaction(async tx => {
        const { a, g, time, fresh, previousAccount } = await load(tx, uid);
        if (fresh) {
          if (!g) fail("USAGE_NOT_CONFIGURED", 503);
          const day = new Date(time).toISOString().slice(0, 10);
          if ((g.grants?.[day] || 0) >= caps.maxAccountGrantsPerDay)
            fail("ENROLMENT_BUDGET_REACHED", 429);
          g.grants = { ...(g.grants || {}), [day]: (g.grants?.[day] || 0) + 1 };
          tx.set(control, g);
        }
        a.userId = uid;
        // Status still reads authoritative entitlement/ledger state. Persist
        // actual resets, plan changes and expired history, never an idle poll.
        if (!isDeepStrictEqual(a, previousAccount)) tx.set(account(uid), a);
        return summary(a, time);
      });
    },
    // Server inventory/reconciliation only. Never accept a browser's used-byte count.
    async recordStorageInventory(uid, bytes) {
      integer(bytes, "STORAGE_BYTES");
      return db.runTransaction(async tx => {
        const { a, g, time } = await load(tx, uid);
        if (!g) fail("USAGE_NOT_CONFIGURED", 503);
        g.storageBytes = Math.max(0, (g.storageBytes || 0) + bytes - (a.storageMeasured ? a.storageBytes : 0));
        tx.set(control, g);
        a.storageBytes = bytes;
        a.storageMeasured = true;
        a.storageMeasuredAt = time;
        tx.set(account(uid), a);
      });
    },
    async reserveStorage(uid, { requestId, storagePath, bytes, retentionHours = 24 }) {
      integer(bytes, "STORAGE_BYTES", 1);
      integer(retentionHours, "RETENTION_HOURS", 1);
      if (
        retentionHours > 720 ||
        typeof storagePath !== "string" ||
        !storagePath.startsWith(`uploads/videos/${uid}/`) ||
        storagePath.includes("..")
      )
        fail("INVALID_STORAGE_PATH");
      const leaseId = key(uid, identifier(requestId));
      const leaseRef = ref("storage_reservations", leaseId);
      return db.runTransaction(async tx => {
        const lease = await tx.get(leaseRef);
        const { a, g, time } = await load(tx, uid);
        if (lease.exists) {
          if (lease.data().bytes !== bytes || lease.data().storagePath !== storagePath)
            fail("IDEMPOTENCY_CONFLICT", 409);
          return { ...lease.data(), leaseId, duplicate: true };
        }
        if (!a.storageMeasured) fail("STORAGE_INVENTORY_REQUIRED", 409);
        if (a.storageBytes + (a.storageReservedBytes || 0) + bytes > plans(a.planId).storageBytes)
          fail("STORAGE_CAPACITY_REACHED", 429);
        if ((g.storageBytes || 0) + (g.storageReservedBytes || 0) + bytes > caps.maxStorageBytes)
          fail("GLOBAL_STORAGE_CAPACITY_REACHED", 429);
        g.storageReservedBytes = (g.storageReservedBytes || 0) + bytes;
        tx.set(control, g);
        const record = {
          userId: uid,
          storagePath,
          bytes,
          expiresAt: time + 3600000,
          retainUntil: time + retentionHours * 3600000,
          state: "reserved",
          leaseId,
        };
        a.storageReservedBytes = (a.storageReservedBytes || 0) + bytes;
        tx.set(account(uid), a);
        tx.create(leaseRef, record);
        return record;
      });
    },
    // The caller must independently read object generation/bytes (or prove deletion)
    // from private Storage before invoking this internal method. No reset releases it.
    async reconcileStorage(uid, leaseId, { exists, measuredBytes, generation, uploadClosed = false }) {
      if (typeof exists !== "boolean") fail("INVALID_STORAGE_EVIDENCE");
      integer(measuredBytes, "STORAGE_BYTES");
      return db.runTransaction(async tx => {
        const leaseRef = ref("storage_reservations", identifier(leaseId)),
          snap = await tx.get(leaseRef);
        const r = snap.data();
        if (!r || r.userId !== uid) fail("STORAGE_RESERVATION_NOT_FOUND", 404);
        const { a, g, time } = await load(tx, uid);
        if (r.state !== "reserved") return r;
        if (!exists && (!uploadClosed || time < r.expiresAt)) fail("STORAGE_UPLOAD_STILL_POSSIBLE", 409);
        if (exists && (measuredBytes !== r.bytes || !/^[0-9]+$/.test(generation || "")))
          fail("STORAGE_EVIDENCE_MISMATCH", 409);
        a.storageReservedBytes -= r.bytes;
        g.storageReservedBytes -= r.bytes;
        if (exists) g.storageBytes = (g.storageBytes || 0) + measuredBytes;
        tx.set(control, g);
        if (exists) a.storageBytes += measuredBytes;
        r.state = exists ? "stored" : "released";
        r.generation = generation || null;
        tx.set(account(uid), a);
        tx.set(leaseRef, r);
        return r;
      });
    },
    async reserve(uid, { operation, requestId, fingerprint, approvedTokens }) {
      identifier(fingerprint);
      const q = quote(operation, operations);
      if (approvedTokens !== q.tokens) fail("PROCESSING_ESTIMATE_REQUIRED", 409);
      return db.runTransaction(async tx => {
        const { a, g, existing, time, fresh } = await load(tx, uid, requestId);
        if (existing) {
          if (existing.operation !== operation || existing.fingerprint !== fingerprint)
            fail("IDEMPOTENCY_CONFLICT", 409);
          return { ...existing, duplicate: true }; // Caller must never dispatch a duplicate.
        }
        validateGlobal(g);
        const day = new Date(time).toISOString().slice(0, 10),
          month = day.slice(0, 7);
        const p = plans(a.planId);
        if (fresh && (g.grants?.[day] || 0) >= caps.maxAccountGrantsPerDay)
          fail("ENROLMENT_BUDGET_REACHED", 429);
        if (a.active >= caps.maxActiveUser || g.active >= caps.maxActive)
          fail("CONCURRENT_JOB_LIMIT", 429);
        if (a.history.length >= caps.maxEventsPerUser) fail("USAGE_EVENT_LIMIT", 429);
        if (q.tokens > summary(a, time).remaining) fail("PROCESSING_ALLOWANCE_REACHED", 429);
        // All outstanding work remains a liability across calendar and allowance resets.
        if (
          (g.days[day] || 0) + g.reservedMicros + q.maxMicros > caps.dailyMicros ||
          (g.months[month] || 0) + g.reservedMicros + q.maxMicros > caps.monthlyMicros
        )
          fail("GLOBAL_PROCESSING_BUDGET", 429);
        if (
          a.planId === "free" &&
          (g.freeDays[day] || 0) + g.reservedMicros + q.maxMicros > caps.freeDailyMicros
        )
          fail("FREE_PROCESSING_BUDGET", 429);
        if (
          q.resource === "external-api" &&
          (g.apiDays[day] || 0) + g.reservedMicros + q.maxMicros > caps.apiDailyMicros
        )
          fail("EXTERNAL_API_BUDGET", 429);
        if (
          a.history.reduce((s, e) => s + e.micros, 0) + a.reservedMicros + q.maxMicros >
          p.rolling30DayTokens * TOKEN_MICROS
        )
          fail("ROLLING_PROCESSING_BUDGET", 429);
        a.userId = uid;
        a.used += q.tokens;
        a.reservedMicros += q.maxMicros;
        a.active++;
        g.reservedMicros += q.maxMicros;
        g.active++;
        if (fresh) g.grants = { ...(g.grants || {}), [day]: (g.grants?.[day] || 0) + 1 };
        const record = {
          userId: uid,
          requestId,
          operation,
          fingerprint,
          tokens: q.tokens,
          maxMicros: q.maxMicros,
          maxSeconds: q.maxSeconds,
          resource: q.resource,
          planId: a.planId,
          cycleStart: a.cycleStart,
          state: "reserved",
          attempts: 0,
          reservedAt: time,
          expiresAt: time + q.maxSeconds * 1000 + 60000,
        };
        tx.set(account(uid), a);
        tx.set(control, g);
        tx.create(job(uid, requestId), record);
        tx.create(ref("events", key(uid, requestId, "reserved")), { ...record, type: "reserved" });
        return record;
      });
    },
    async start(uid, requestId) {
      return db.runTransaction(async tx => {
        const snapshot = await tx.get(job(uid, requestId));
        const r = snapshot.data();
        if (!r || r.state !== "reserved" || r.attempts !== 0) fail("JOB_ALREADY_DISPATCHED", 409);
        const c = await tx.get(control);
        validateGlobal(c.data());
        if (now() >= r.expiresAt) fail("RESERVATION_EXPIRED", 409);
        r.state = "started";
        r.attempts = 1;
        r.startedAt = now();
        tx.set(job(uid, requestId), r);
        return r;
      });
    },
    async authorizeDispatch(uid, requestId) {
      return db.runTransaction(async tx => {
        const [snapshot, c] = await tx.getAll(job(uid, requestId), control);
        validateGlobal(c.data());
        const r = snapshot.data();
        if (!r || r.state !== "started" || r.dispatchClaimed) fail("JOB_ALREADY_DISPATCHED", 409);
        if (now() >= r.expiresAt) fail("RESERVATION_EXPIRED", 409);
        tx.set(job(uid, requestId), { ...r, dispatchClaimed: true, dispatchClaimedAt: now() });
      });
    },
    // Only authenticated workers/operators call this with measured usage. An HTTP timeout
    // is not proof that work stopped. Uncertain jobs retain their liability and active slot.
    async settle(uid, requestId, { eventId, success, actualMicros, stopped = false }) {
      identifier(eventId);
      integer(actualMicros, "ACTUAL_COST");
      if (typeof success !== "boolean" || stopped !== true)
        fail("WORKER_STOP_CONFIRMATION_REQUIRED", 409);
      return db.runTransaction(async tx => {
        const { a, g, existing: r, time } = await load(tx, uid, requestId);
        if (!r) fail("JOB_NOT_FOUND", 404);
        if (r.state === "settled") {
          if (r.eventId !== eventId || r.actualMicros !== actualMicros || r.success !== success)
            fail("SETTLEMENT_CONFLICT", 409);
          return { ...r, duplicate: true };
        }
        if (r.state === "reserved" && actualMicros !== 0) fail("JOB_NOT_STARTED", 409);
        const day = new Date(time).toISOString().slice(0, 10),
          month = day.slice(0, 7);
        const consumed = success ? Math.min(r.tokens, Math.ceil(actualMicros / TOKEN_MICROS)) : 0;
        // A refund belongs to the original cycle. Never inflate a later allowance.
        if (r.cycleStart === a.cycleStart) a.used -= r.tokens - consumed;
        a.active--;
        a.reservedMicros -= r.maxMicros;
        a.history.push({ at: time, micros: actualMicros, requestId });
        g.active--;
        g.reservedMicros -= r.maxMicros;
        g.days[day] = (g.days[day] || 0) + actualMicros;
        g.months[month] = (g.months[month] || 0) + actualMicros;
        if (r.planId === "free") g.freeDays[day] = (g.freeDays[day] || 0) + actualMicros;
        if (r.resource === "external-api") g.apiDays[day] = (g.apiDays[day] || 0) + actualMicros;
        if (actualMicros > r.maxMicros) {
          g.enabled = false;
          g.suspensionReason = "COST_BOUND_EXCEEDED";
        }
        Object.assign(r, {
          state: "settled",
          eventId,
          success,
          actualMicros,
          consumedTokens: consumed,
          settledAt: time,
        });
        tx.set(account(uid), a);
        tx.set(control, g);
        tx.set(job(uid, requestId), r);
        tx.create(ref("events", key(uid, requestId, "settled")), { ...r, type: "settled" });
        return r;
      });
    },
  };
}
module.exports = { createProcessingService, DEFAULT_LIMITS };
