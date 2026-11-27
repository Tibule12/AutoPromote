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
  apiReservedMicros: 0,
  freeReservedMicros: 0,
  active: 0,
  days: {},
  months: {},
  freeDays: {},
  apiDays: {},
});
const DEFAULT_LIMITS = Object.freeze({
  dailyMicros: 2000000,
  monthlyMicros: 10000000,
  freeDailyMicros: 2000000,
  apiDailyMicros: 50000,
  maxActive: 1,
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
  namespace = 'processing',
}) {
  if (!/^processing(?:_qualification_[a-z0-9_]+)?$/.test(namespace)) fail('INVALID_LEDGER_NAMESPACE', 503);
  const caps = { ...DEFAULT_LIMITS, ...limits };
  Object.entries(caps).forEach(([name, value]) => integer(value, name, 1));
  const ref = (collection, id) => db.collection(`${namespace}_${collection}`).doc(id);
  const account = uid => ref("accounts", key(identifier(uid)));
  const control = ref("control", "global");
  const job = (uid, requestId) => ref("jobs", key(identifier(uid), identifier(requestId)));
  const priced = (operation, profileId) => ({
    ...quote(profileId ? `${operation}@${identifier(profileId)}` : operation, operations),
    operation, ...(profileId ? { profileId } : {}),
  });
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
        schemaVersion: 2,
        userId: null,
        planId,
        cycleStart: time,
        resetAt: time + p.resetHours * 3600000,
        cycleAllowance: p.tokens,
        used: 0,
        reservedMicros: 0,
        reservedTokens: 0,
        active: 0,
        history: [],
        storageBytes: 0,
      };
    // Only historical prelaunch records used cash as their token unit. Migrate
    // those existing holds/history without resetting any allowance or liability.
    if (a.schemaVersion !== 2) {
      a.reservedTokens = Math.ceil(a.reservedMicros / TOKEN_MICROS);
      a.used = Math.max(0, a.used - a.reservedTokens);
      a.history = a.history.map(event => ({ ...event,
        tokens: Number.isSafeInteger(event.tokens) ? event.tokens : Math.ceil(event.micros / TOKEN_MICROS) }));
      a.schemaVersion = 2;
    }
    integer(a.reservedTokens, "TOKEN_HOLD");
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
    const spentTokens = a.history.reduce((sum, event) => sum + event.tokens, 0);
    const cycleRemainingTokens = Math.max(0, a.cycleAllowance - a.used - a.reservedTokens);
    const rollingRemainingTokens = Math.max(0,
      p.rolling30DayTokens - spentTokens - a.reservedTokens);
    const remaining = Math.min(cycleRemainingTokens, rollingRemainingTokens);
    const purchasedRemainingTokens=Math.max(0,(a.purchasedTokens||0)-(a.reservedPurchasedTokens||0));
    return {
      planId: a.planId,
      allowance: a.cycleAllowance,
      remaining,
      purchasedRemainingTokens,
      purchasedReservedTokens:a.reservedPurchasedTokens||0,
      purchasedDebtTokens:Math.max(0,-(a.purchasedTokens||0)),
      totalAvailableTokens:remaining+purchasedRemainingTokens,
      remainingPercent: Math.round((100 * remaining) / a.cycleAllowance),
      cycleRemainingTokens,
      rollingRemainingTokens,
      exhaustionReason: remaining > 0 ? null : cycleRemainingTokens === 0
        ? (rollingRemainingTokens === 0 ? "cycle_and_rolling" : "cycle") : "rolling",
      nextResetAt: new Date(a.resetAt).toISOString(),
      rolling30DayLimit: p.rolling30DayTokens,
      rollingSpentTokens: spentTokens,
      reservedTokens: a.reservedTokens,
      storage: {
        usedBytes: a.storageBytes,
        reservedBytes: a.storageReservedBytes || 0,
        limitBytes: p.storageBytes,
        measured: a.storageMeasured === true,
      },
      activeJobs: a.active,
      localEditingAvailable: true,
      provisional: !require('../../../config/free-first-release/activation.json').enabled,
      rollingAvailableAt: a.history.some(e => e.tokens > 0)
        ? new Date(Math.min(...a.history.filter(e => e.tokens > 0).map(e => e.at)) + 30 * DAY).toISOString()
        : null,
      asOf: new Date(time).toISOString(),
    };
  }
  function validateGlobal(g) {
    if (!g?.enabled) fail("CLOUD_PROCESSING_PAUSED", 503);
  }
  async function initializeCashHolds(tx, g) {
    if (Number.isSafeInteger(g.apiReservedMicros) && Number.isSafeInteger(g.freeReservedMicros)) return;
    // One-time migration of existing outstanding liabilities. Do not turn a
    // missing counter into zero while an old reservation is still unsettled.
    let rows = [];
    if (g.reservedMicros) {
      const snapshot = await tx.get(db.collection(`${namespace}_jobs`)
        .where('state', 'in', ['reserved', 'started']).limit(5001));
      if (snapshot.size > 5000) fail('CASH_HOLD_MIGRATION_REQUIRED', 503);
      rows = snapshot.docs.map(doc => doc.data());
      if (rows.reduce((sum, row) => sum + row.maxMicros, 0) !== g.reservedMicros)
        fail('CASH_HOLD_RECONCILIATION_REQUIRED', 503);
    }
    g.apiReservedMicros = rows.filter(row => row.resource === 'external-api')
      .reduce((sum, row) => sum + row.maxMicros, 0);
    g.freeReservedMicros = rows.filter(row => row.planId === 'free')
      .reduce((sum, row) => sum + row.maxMicros, 0);
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
    jobCollectionName: `${namespace}_jobs`,
    // Payment verification is server-only. This transaction shares the same
    // account authority as reservations, so resets/captures/replays cannot lose
    // purchased tokens or change any historical legacy wallet.
    async applyTopup(uid,{orderId,captureId}) {
      identifier(orderId);identifier(captureId);
      return db.runTransaction(async tx=>{
        const intentRef=ref('topup_orders',orderId),claimRef=ref('topup_captures',captureId);
        const [intentSnap,claim]=await tx.getAll(intentRef,claimRef);
        const intent=intentSnap.data(),pack=require('../payments/processingTopupCatalog').PACKS[intent?.packageId];
        if(!intent||intent.userId!==uid||intent.captureId!==captureId||intent.paymentVerified!==true||!pack||
           intent.amount!==pack.price||intent.currency!=='USD')fail('VERIFIED_TOPUP_REQUIRED',409);
        if(intent.revoked===true)fail('PAYMENT_REVOKED',409);
        const previous=claim.data();
        if(previous&&(previous.userId!==uid||previous.orderId!==orderId))fail('TOPUP_OWNER_MISMATCH',403);
        if(previous?.credited)return{tokensAdded:0,duplicate:true};
        const {a,time}=await load(tx,uid);
        const tokensAdded=pack.tokens-(previous?.revokedTokens||0);
        a.purchasedTokens=(a.purchasedTokens||0)+tokensAdded;
        if(!Number.isSafeInteger(a.purchasedTokens))fail('INVALID_PURCHASED_BALANCE',503);
        a.userId=uid;
        tx.set(account(uid),a);
        tx.set(claimRef,{...previous,userId:uid,orderId,captureId,packageId:pack.id,tokens:pack.tokens,credited:true,creditedAt:time});
        tx.update(intentRef,{state:'credited',creditedAt:time});
        return{tokensAdded,duplicate:false};
      });
    },
    async revokeTopup(captureId,{orderId,refundId,tokens}={}) {
      identifier(captureId);
      identifier(refundId);
      return db.runTransaction(async tx=>{
        const claimRef=ref('topup_captures',captureId),claim=(await tx.get(claimRef)).data();
        orderId=claim?.orderId||orderId;if(!orderId)return{unrelated:true};
        const intentRef=ref('topup_orders',identifier(orderId)),intent=(await tx.get(intentRef)).data();
        if(!intent||intent.captureId&&intent.captureId!==captureId)return{unrelated:true};
        const pack=require('../payments/processingTopupCatalog').PACKS[intent.packageId];
        if(!pack)fail('INVALID_TOPUP_PACKAGE',409);
        if(claim?.refundIds?.includes(refundId))return{duplicate:true};
        if((claim?.refundIds?.length||0)>100)fail('REFUND_RECONCILIATION_REQUIRED',503);
        const previous=claim?.revokedTokens||0;
        const revokedTokens=Math.min(pack.tokens,previous+(tokens===undefined?pack.tokens:integer(tokens,'REFUND_TOKENS',1)));
        const {a,time}=await load(tx,intent.userId);
        a.userId=intent.userId;
        // Keep a signed debt if refunded tokens have already been used or held;
        // a late worker settlement or another purchase cannot recreate them.
        if(claim?.credited)a.purchasedTokens=(a.purchasedTokens||0)-(revokedTokens-previous);
        tx.set(account(intent.userId),a);
        tx.set(claimRef,{...claim,userId:intent.userId,orderId,captureId,tokens:pack.tokens,
          revokedTokens,refundIds:[...(claim?.refundIds||[]),refundId],revokedAt:time});
        tx.update(intentRef,{...(revokedTokens===pack.tokens?{revoked:true}:{}),revokedTokens,revokedAt:time});
        return{revoked:true};
      });
    },
    quote: priced,
    async purchaseCapacity(requiredMicros) {
      integer(requiredMicros, "PURCHASE_CAPACITY", 1);
      const g = (await control.get()).data();
      const day = new Date(now()).toISOString().slice(0, 10), month = day.slice(0, 7);
      const held = g?.reservedMicros || 0;
      const dailyRemaining = Math.max(0, caps.dailyMicros - (g?.days?.[day] || 0) - held);
      const monthlyRemaining = Math.max(0, caps.monthlyMicros - (g?.months?.[month] || 0) - held);
      return { available: g?.enabled === true && g.purchasesPaused !== true && dailyRemaining >= requiredMicros && monthlyRemaining >= requiredMicros,
        requiredMicros, dailyRemaining, monthlyRemaining };
    },
    // Operator provisioning is deliberately not exposed through a user API.
    async configure({ enabled = false } = {}) {
      return db.runTransaction(async tx => {
        const current = await tx.get(control);
        const previous = current.data();
        if (previous) await initializeCashHolds(tx, previous);
        tx.set(control, { ...blank(), ...(previous || {}), enabled });
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
    async reserve(uid, { operation, profileId, requestId, fingerprint, approvedTokens, notBefore = 0, legacyCashOnly = false }) {
      identifier(fingerprint);
      integer(notBefore, "DISPATCH_TIME");
      const q = priced(operation, profileId);
      if (legacyCashOnly) {
        if (operation !== 'publisher.publish') fail('INVALID_LEGACY_OBLIGATION', 403);
        q.tokens = 0;
        q.tokenPricing = 'fixed-v1';
      }
      if (approvedTokens !== q.tokens) fail("PROCESSING_ESTIMATE_REQUIRED", 409);
      return db.runTransaction(async tx => {
        const { a, g, existing, time, fresh } = await load(tx, uid, requestId);
        if (notBefore > time + 30 * DAY) fail("SCHEDULE_OUTSIDE_BUDGET_WINDOW", 409);
        if (existing) {
          if (existing.operation !== operation || existing.profileId !== profileId || Boolean(existing.legacyCashOnly) !== legacyCashOnly || existing.fingerprint !== fingerprint ||
              (existing.notBefore || 0) !== notBefore)
            fail("IDEMPOTENCY_CONFLICT", 409);
          return { ...existing, duplicate: true }; // Caller must never dispatch a duplicate.
        }
        validateGlobal(g);
        await initializeCashHolds(tx, g);
        const day = new Date(time).toISOString().slice(0, 10),
          month = day.slice(0, 7);
        const p = plans(a.planId);
        if (fresh && (g.grants?.[day] || 0) >= caps.maxAccountGrantsPerDay)
          fail("ENROLMENT_BUDGET_REACHED", 429);
        // A future publication holds tokens and cash, not a running-worker slot.
        // Its slot is acquired transactionally at dispatch, under the same cap.
        const activeCounted = notBefore <= time;
        if (activeCounted && (a.active >= caps.maxActiveUser || g.active >= caps.maxActive))
          fail("CONCURRENT_JOB_LIMIT", 429);
        if (a.history.length >= caps.maxEventsPerUser) fail("USAGE_EVENT_LIMIT", 429);
        const available=summary(a,time);
        if(q.tokens>available.totalAvailableTokens)fail('PROCESSING_ALLOWANCE_REACHED',429);
        const renewableTokens=Math.min(q.tokens,available.remaining),purchasedTokens=q.tokens-renewableTokens;
        // All outstanding work remains a liability across calendar and allowance resets.
        if (
          (g.days[day] || 0) + g.reservedMicros + q.maxMicros > caps.dailyMicros ||
          (g.months[month] || 0) + g.reservedMicros + q.maxMicros > caps.monthlyMicros
        )
          fail("GLOBAL_PROCESSING_BUDGET", 429);
        if (
          a.planId === "free" &&
          (g.freeDays[day] || 0) + g.freeReservedMicros + q.maxMicros > caps.freeDailyMicros
        )
          fail("FREE_PROCESSING_BUDGET", 429);
        if (
          q.resource === "external-api" &&
          (g.apiDays[day] || 0) + g.apiReservedMicros + q.maxMicros > caps.apiDailyMicros
        )
          fail("EXTERNAL_API_BUDGET", 429);
        if (
          a.history.reduce((s, e) => s + e.tokens, 0) + a.reservedTokens + renewableTokens >
          p.rolling30DayTokens
        )
          fail("ROLLING_PROCESSING_BUDGET", 429);
        a.userId = uid;
        a.reservedTokens += renewableTokens;
        a.reservedPurchasedTokens=(a.reservedPurchasedTokens||0)+purchasedTokens;
        a.reservedMicros += q.maxMicros;
        if (activeCounted) a.active++;
        g.reservedMicros += q.maxMicros;
        if (a.planId === 'free') g.freeReservedMicros += q.maxMicros;
        if (q.resource === 'external-api') g.apiReservedMicros += q.maxMicros;
        if (activeCounted) g.active++;
        if (fresh) g.grants = { ...(g.grants || {}), [day]: (g.grants?.[day] || 0) + 1 };
        const record = {
          userId: uid,
          requestId,
          operation,
          ...(profileId ? { profileId } : {}),
          ...(legacyCashOnly ? { legacyCashOnly: true } : {}),
          fingerprint,
          tokens: q.tokens,
          renewableTokens,purchasedTokens,
          tokenPricing: q.tokenPricing,
          maxMicros: q.maxMicros,
          maxSeconds: q.maxSeconds,
          resource: q.resource,
          planId: a.planId,
          cycleStart: a.cycleStart,
          state: "reserved",
          attempts: 0,
          notBefore,
          activeCounted,
          reservedAt: time,
          expiresAt: Math.max(time, notBefore) + q.maxSeconds * 1000 + 60000,
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
        const { a, g, existing: r, time } = await load(tx, uid, requestId);
        if (!r || r.state !== "reserved" || r.attempts !== 0) fail("JOB_ALREADY_DISPATCHED", 409);
        validateGlobal(g);
        if (time < (r.notBefore || 0)) fail("PUBLICATION_NOT_DUE", 409);
        if (time >= r.expiresAt) fail("RESERVATION_EXPIRED", 409);
        if (r.activeCounted === false) {
          if (a.active >= caps.maxActiveUser || g.active >= caps.maxActive)
            fail("CONCURRENT_JOB_LIMIT", 429);
          a.active++;
          g.active++;
          r.activeCounted = true;
          tx.set(account(uid), a);
          tx.set(control, g);
        }
        r.state = "started";
        r.attempts = 1;
        r.startedAt = time;
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
    async settle(uid, requestId, { eventId, success, actualMicros, consumedTokens, stopped = false }) {
      identifier(eventId);
      integer(actualMicros, "ACTUAL_COST");
      if (typeof success !== "boolean" || stopped !== true)
        fail("WORKER_STOP_CONFIRMATION_REQUIRED", 409);
      return db.runTransaction(async tx => {
        const { a, g, existing: r, time } = await load(tx, uid, requestId);
        if (!r) fail("JOB_NOT_FOUND", 404);
        if (r.state === "settled") {
          if (r.eventId !== eventId || r.actualMicros !== actualMicros || r.success !== success ||
              (consumedTokens !== undefined && consumedTokens !== r.consumedTokens))
            fail("SETTLEMENT_CONFLICT", 409);
          return { ...r, duplicate: true };
        }
        if (r.state === "reserved" && actualMicros !== 0) fail("JOB_NOT_STARTED", 409);
        await initializeCashHolds(tx, g);
        const day = new Date(time).toISOString().slice(0, 10),
          month = day.slice(0, 7);
        const quoted = r.tokenPricing === "fixed-v1";
        const consumed = success ? (consumedTokens === undefined
          ? (quoted ? r.tokens : Math.min(r.tokens, Math.ceil(actualMicros / TOKEN_MICROS)))
          : integer(consumedTokens, "CONSUMED_TOKENS")) : 0;
        if (consumed > r.tokens) fail("TOKEN_QUOTE_EXCEEDED", 409);
        // A refund belongs to the original cycle. Never inflate a later allowance.
        const renewableConsumed=Math.min(consumed,r.renewableTokens??r.tokens);
        const purchasedConsumed=consumed-renewableConsumed;
        if (r.cycleStart === a.cycleStart) a.used += renewableConsumed;
        a.reservedTokens -= r.renewableTokens??r.tokens;
        a.reservedPurchasedTokens=(a.reservedPurchasedTokens||0)-(r.purchasedTokens||0);
        a.purchasedTokens=(a.purchasedTokens||0)-purchasedConsumed;
        integer(a.reservedTokens, "TOKEN_HOLD");
        integer(a.reservedPurchasedTokens,'PURCHASED_TOKEN_HOLD');
        // Records created before deferred dispatch always owned a slot.
        if (r.activeCounted !== false) a.active--;
        a.reservedMicros -= r.maxMicros;
        a.history.push({ at: time, micros: actualMicros,
          tokens: quoted ? renewableConsumed : Math.ceil(actualMicros / TOKEN_MICROS),
          purchasedTokens:purchasedConsumed,requestId });
        if (r.activeCounted !== false) g.active--;
        g.reservedMicros -= r.maxMicros;
        if (r.planId === 'free') g.freeReservedMicros -= r.maxMicros;
        if (r.resource === 'external-api') g.apiReservedMicros -= r.maxMicros;
        integer(g.apiReservedMicros, 'API_CASH_HOLD');
        integer(g.freeReservedMicros, 'FREE_CASH_HOLD');
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
