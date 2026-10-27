const crypto = require("crypto");
const { assertSandbox } = require("./runtime");
const {
  fail,
  integer,
  checkedAdd,
  checkedMultiply,
  validatePolicy,
  quoteOperation,
} = require("./policy");

const id = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const month = time => new Date(time).toISOString().slice(0, 7);
const emptyBudget = () => ({
  spentMicros: 0,
  reservedMicros: 0,
  issuedMicros: 0,
  pendingRewardMicros: 0,
});
function identifier(value) {
  if (typeof value !== "string" || !value.length || value.length > 160) fail("INVALID_IDENTIFIER");
  return value;
}

function createWalletService({ db, policy: input, verifier, now = Date.now }) {
  assertSandbox(process.env, db);
  const policy = validatePolicy(input);
  if (verifier?.provider !== "local-mock") fail("PROVIDER_ADAPTER_NOT_REVIEWED", 503);
  const ref = (collection, key) => db.collection(`credits_v2_${collection}`).doc(key);
  const walletRef = uid => ref("wallets", id(identifier(uid)));
  const controlRef = ref("control", "global");
  const budgetRef = cycle => ref("budgets", cycle);
  const userBudgetRef = (uid, cycle) => ref("user_budgets", id(uid, cycle));
  function guard() {
    assertSandbox(process.env, db);
  }
  function ledger(tx, key, data) {
    tx.create(ref("ledger", id(key)), { ...data, timestamp: now(), sandbox: true });
  }
  function checkWallet(w) {
    for (const key of [
      "balance",
      "reserved",
      "expiring",
      "permanent",
      "activeOperations",
      "adsAwarded",
      "pendingRewardCredits",
    ])
      integer(w[key], key);
    if (w.balance !== checkedAdd(w.expiring, w.permanent)) fail("WALLET_INVARIANT", 503);
    if (checkedAdd(checkedAdd(w.balance, w.reserved), w.pendingRewardCredits) > policy.maxBalance)
      fail("WALLET_CAP", 409);
  }
  function issueBudget(b, amount) {
    const cost = checkedMultiply(amount, policy.microsPerCredit);
    if (
      checkedAdd(checkedAdd(b.issuedMicros, b.pendingRewardMicros), cost) >
      policy.monthlyIssuanceMicros
    ) {
      fail("ISSUANCE_BUDGET_EXCEEDED", 429);
    }
    b.issuedMicros = checkedAdd(b.issuedMicros, cost);
  }
  async function context(tx, uid) {
    const cycle = month(now());
    const [ws, cs, bs, us] = await tx.getAll(
      walletRef(uid),
      controlRef,
      budgetRef(cycle),
      userBudgetRef(uid, cycle)
    );
    if (!ws.exists) fail("WALLET_NOT_ENROLLED", 404);
    if (!cs.exists) fail("CONTROL_NOT_CONFIGURED", 503);
    return {
      uid,
      cycle,
      w: ws.data(),
      c: cs.data(),
      b: bs.exists ? bs.data() : emptyBudget(),
      u: us.exists ? us.data() : { spentMicros: 0, reservedMicros: 0 },
    };
  }
  function renew(tx, ctx) {
    const { uid, cycle, w, c, b } = ctx;
    if (w.cycle === cycle) return;
    if (w.cycle && w.cycle > cycle) fail("CLOCK_MOVED_BACKWARDS", 503);
    if (!c.issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
    const expired = w.expiring;
    w.balance -= expired;
    w.expiring = 0;
    w.totals.expired = checkedAdd(w.totals.expired, expired);
    const amount = Math.min(
      policy.monthlyCredits[w.tier],
      policy.maxBalance - w.balance - w.reserved - w.pendingRewardCredits
    );
    issueBudget(b, amount);
    w.expiring = amount;
    w.balance = checkedAdd(w.balance, amount);
    w.totals.granted = checkedAdd(w.totals.granted, amount);
    w.cycle = cycle;
    w.adsAwarded = 0;
    ledger(tx, [uid, "renew", cycle], {
      userId: uid,
      kind: "monthly_grant",
      source: "granted",
      cycle,
      amount,
      expired,
      tier: w.tier,
      pricingRevision: policy.revision,
    });
  }
  function save(tx, ctx) {
    checkWallet(ctx.w);
    tx.set(walletRef(ctx.uid), ctx.w);
    tx.set(controlRef, ctx.c);
    tx.set(budgetRef(ctx.cycle), ctx.b);
    tx.set(userBudgetRef(ctx.uid, ctx.cycle), ctx.u);
  }
  function summary(w) {
    checkWallet(w);
    return {
      sandbox: true,
      balance: w.balance,
      reserved: w.reserved,
      tier: w.tier,
      cycle: w.cycle,
      renewsAt: new Date(
        Date.UTC(Number(w.cycle.slice(0, 4)), Number(w.cycle.slice(5)), 1)
      ).toISOString(),
      monthlyAllowance: policy.monthlyCredits[w.tier],
      maxBalance: policy.maxBalance,
      totals: w.totals,
      rewardCredits: policy.rewardCredits,
      adsRemaining:
        w.tier === "free"
          ? Math.max(0, policy.rewardMonthlyCap - w.adsAwarded - Number(Boolean(w.activeReward)))
          : 0,
      activeReward: w.activeReward,
      adFree: w.tier !== "free",
      pricingRevision: policy.revision,
    };
  }
  async function initialiseControl() {
    guard();
    // An explicit local setup action. Restarting the server never overwrites a kill switch.
    await db.runTransaction(async tx => {
      const snap = await tx.get(controlRef);
      if (!snap.exists)
        tx.create(controlRef, {
          spendingEnabled: true,
          rewardsEnabled: policy.rewardsDisabled !== true,
          issuanceEnabled: true,
          activeOperations: 0,
          ...(policy.lifetimeSpendMicros !== undefined
            ? {
                spendScope: policy.spendScope,
                lifetimeSpendMicros: policy.lifetimeSpendMicros,
                lifetimeSpentMicros: 0,
                lifetimeReservedMicros: 0,
              }
            : {}),
        });
      else if (
        (policy.lifetimeSpendMicros !== undefined ||
          snap.data().lifetimeSpendMicros !== undefined) &&
        (snap.data().spendScope !== policy.spendScope ||
          snap.data().lifetimeSpendMicros !== policy.lifetimeSpendMicros)
      )
        fail("PILOT_BUDGET_SCOPE_CONFLICT", 409);
    });
  }
  async function enroll(uid, { tier = "free", openingBalance = 0 } = {}) {
    guard();
    identifier(uid);
    integer(openingBalance, "OPENING_BALANCE");
    if (!Object.hasOwn(policy.monthlyCredits, tier)) fail("INVALID_TIER");
    if (openingBalance > policy.maxBalance) fail("WALLET_CAP", 409);
    await db.runTransaction(async tx => {
      const [ws, cs, bs] = await tx.getAll(walletRef(uid), controlRef, budgetRef(month(now())));
      if (ws.exists) return; // Never reset an existing wallet on restart.
      if (!cs.exists || !cs.data().issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
      const b = bs.exists ? bs.data() : emptyBudget();
      issueBudget(b, openingBalance);
      tx.create(walletRef(uid), {
        userId: uid,
        tier,
        cycle: null,
        balance: openingBalance,
        permanent: openingBalance,
        expiring: 0,
        reserved: 0,
        activeOperations: 0,
        activeReward: null,
        adsAwarded: 0,
        pendingRewardCredits: 0,
        totals: {
          opening: openingBalance,
          granted: 0,
          earned: 0,
          purchased: 0,
          consumed: 0,
          refunded: 0,
          expired: 0,
        },
      });
      tx.set(budgetRef(month(now())), b);
      ledger(tx, [uid, "enroll"], {
        userId: uid,
        kind: "opening_balance",
        source: "opening",
        amount: openingBalance,
      });
    });
  }
  async function getAccount(uid) {
    guard();
    return db.runTransaction(async tx => {
      const ctx = await context(tx, uid);
      renew(tx, ctx);
      save(tx, ctx);
      return summary(ctx.w);
    });
  }
  async function grantPurchased(uid, amount, paymentEventId) {
    guard();
    integer(amount, "PURCHASE_AMOUNT", 1);
    identifier(paymentEventId);
    // Internal sandbox adapter only. A future payment adapter must verify owner, amount,
    // currency and package against a stored order before calling the wallet.
    const eventRef = ref("events", id("purchase", paymentEventId));
    return db.runTransaction(async tx => {
      const [ctx, existing] = await Promise.all([context(tx, uid), tx.get(eventRef)]);
      if (existing.exists) {
        if (existing.data().userId !== uid || existing.data().amount !== amount)
          fail("EVENT_CONFLICT", 409);
        return { alreadyProcessed: true };
      }
      renew(tx, ctx);
      if (!ctx.c.issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
      issueBudget(ctx.b, amount);
      ctx.w.permanent = checkedAdd(ctx.w.permanent, amount);
      ctx.w.balance = checkedAdd(ctx.w.balance, amount);
      ctx.w.totals.purchased = checkedAdd(ctx.w.totals.purchased, amount);
      save(tx, ctx);
      tx.create(eventRef, { userId: uid, amount, source: "purchased", paymentEventId });
      ledger(tx, ["purchase", paymentEventId], {
        userId: uid,
        source: "purchased",
        kind: "purchase",
        amount,
      });
      return { alreadyProcessed: false, balance: ctx.w.balance };
    });
  }
  async function reserve(
    uid,
    {
      operation,
      units,
      requestId,
      approvedCredits,
      pricingRevision,
      sourceFingerprint = null,
      sourceDescriptor = null,
    }
  ) {
    guard();
    identifier(requestId);
    if (sourceFingerprint !== null && !/^[a-f0-9]{64}$/.test(sourceFingerprint))
      fail("INVALID_SOURCE_FINGERPRINT");
    if (
      sourceDescriptor !== null &&
      (typeof sourceDescriptor !== "object" ||
        Array.isArray(sourceDescriptor) ||
        JSON.stringify(sourceDescriptor).length > 4096)
    )
      fail("INVALID_SOURCE_DESCRIPTOR");
    const sourceSnapshot =
      sourceDescriptor === null ? null : JSON.parse(JSON.stringify(sourceDescriptor));
    const quote = quoteOperation(policy, operation, units);
    if (approvedCredits !== quote.credits || pricingRevision !== quote.pricingRevision)
      fail("PRICE_CHANGED", 409);
    const operationId = id(uid, requestId);
    const operationRef = ref("operations", operationId);
    const fingerprint = id(
      operation,
      units,
      approvedCredits,
      pricingRevision,
      sourceFingerprint,
      sourceSnapshot
    );
    return db.runTransaction(async tx => {
      const [ctx, existing] = await Promise.all([context(tx, uid), tx.get(operationRef)]);
      if (existing.exists) {
        if (existing.data().fingerprint !== fingerprint) fail("IDEMPOTENCY_CONFLICT", 409);
        return { ...existing.data(), alreadyReserved: true };
      }
      renew(tx, ctx);
      const { w, c, b, u } = ctx;
      if (policy.spendingEndsAt !== undefined && now() >= policy.spendingEndsAt)
        fail("PILOT_CLOSED", 503);
      if (!c.spendingEnabled) fail("SPENDING_PAUSED", 503);
      if (c.lifetimeSpendMicros !== undefined && policy.lifetimeSpendMicros === undefined)
        fail("PILOT_BUDGET_SCOPE_CONFLICT", 409);
      if (policy.lifetimeSpendMicros !== undefined) {
        if (
          c.spendScope !== policy.spendScope ||
          c.lifetimeSpendMicros !== policy.lifetimeSpendMicros
        )
          fail("PILOT_BUDGET_SCOPE_CONFLICT", 409);
        if (
          checkedAdd(
            checkedAdd(c.lifetimeSpentMicros, c.lifetimeReservedMicros),
            quote.maxCostMicros
          ) > c.lifetimeSpendMicros
        )
          fail("PILOT_TOTAL_BUDGET_EXCEEDED", 429);
        c.lifetimeReservedMicros = checkedAdd(c.lifetimeReservedMicros, quote.maxCostMicros);
      }
      if (w.balance < quote.credits) fail("INSUFFICIENT_CREDITS", 402);
      if (
        c.activeOperations >= policy.maxActiveGlobal ||
        w.activeOperations >= policy.maxActiveUser
      )
        fail("CAPACITY_LIMIT", 429);
      if (
        checkedAdd(checkedAdd(b.spentMicros, b.reservedMicros), quote.maxCostMicros) >
          policy.monthlySpendMicros ||
        checkedAdd(checkedAdd(u.spentMicros, u.reservedMicros), quote.maxCostMicros) >
          policy.userMonthlySpendMicros
      )
        fail("SPEND_BUDGET_EXCEEDED", 429);
      const fromExpiring = Math.min(w.expiring, quote.credits);
      const fromPermanent = quote.credits - fromExpiring;
      w.balance -= quote.credits;
      w.expiring -= fromExpiring;
      w.permanent -= fromPermanent;
      w.reserved = checkedAdd(w.reserved, quote.credits);
      w.activeOperations++;
      c.activeOperations++;
      b.reservedMicros = checkedAdd(b.reservedMicros, quote.maxCostMicros);
      u.reservedMicros = checkedAdd(u.reservedMicros, quote.maxCostMicros);
      const record = {
        operationId,
        userId: uid,
        requestId,
        fingerprint,
        sourceFingerprint,
        sourceDescriptor: sourceSnapshot,
        ...quote,
        fromExpiring,
        fromPermanent,
        cycle: ctx.cycle,
        state: "reserved",
        createdAt: now(),
      };
      save(tx, ctx);
      tx.create(operationRef, record);
      // Reservation and durable dispatch intent are one Firestore transaction.
      tx.create(ref("outbox", operationId), {
        operationId,
        userId: uid,
        state: "pending",
        createdAt: now(),
      });
      ledger(tx, [operationId, "reserve"], {
        userId: uid,
        kind: "reservation",
        operationId,
        amount: quote.credits,
      });
      return { ...record, alreadyReserved: false };
    });
  }
  async function start(uid, operationId) {
    guard();
    if (policy.spendingEndsAt !== undefined && now() >= policy.spendingEndsAt)
      fail("PILOT_CLOSED", 503);
    identifier(operationId);
    return db.runTransaction(async tx => {
      const [os, cs, intent] = await tx.getAll(
        ref("operations", operationId),
        controlRef,
        ref("outbox", operationId)
      );
      if (!os.exists || os.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
      if (!cs.exists || !cs.data().spendingEnabled) fail("SPENDING_PAUSED", 503);
      const record = os.data();
      if (record.state !== "reserved") fail("OPERATION_ALREADY_STARTED_OR_SETTLED", 409);
      if (record.cycle !== month(now())) fail("RESERVATION_EXPIRED", 409);
      if (!intent.exists || intent.data().userId !== uid || intent.data().state !== "pending")
        fail("DISPATCH_STATE_MISSING", 503);
      // Exactly one dispatcher obtains this transition. Redelivery must not rerun a worker.
      tx.update(os.ref, { state: "running", startedAt: now() });
      tx.update(intent.ref, { state: "claimed", claimedAt: now() });
      return { ...record, state: "running" };
    });
  }
  async function getOperation(uid, operationId) {
    guard();
    identifier(operationId);
    const snap = await ref("operations", operationId).get();
    if (!snap.exists || snap.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
    return snap.data();
  }
  async function attachExecution(uid, operationId, executionId) {
    guard();
    identifier(operationId);
    identifier(executionId);
    return db.runTransaction(async tx => {
      const [op, intent] = await tx.getAll(
        ref("operations", operationId),
        ref("outbox", operationId)
      );
      if (!op.exists || op.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
      if (!intent.exists) fail("DISPATCH_STATE_MISSING", 503);
      if (op.data().executionId) {
        if (op.data().executionId !== executionId) fail("EXECUTION_CONFLICT", 409);
        return { alreadyBound: true };
      }
      if (op.data().state !== "running") fail("OPERATION_NOT_STARTED", 409);
      tx.update(op.ref, { executionId });
      tx.update(intent.ref, { state: "submitted", executionId, submittedAt: now() });
      return { alreadyBound: false };
    });
  }
  async function settle(uid, operationId, outcome, expectedExecutionId = null) {
    guard();
    identifier(operationId);
    if (!["succeeded", "failed", "cancelled"].includes(outcome)) fail("INVALID_OUTCOME");
    return db.runTransaction(async tx => {
      const os = await tx.get(ref("operations", operationId));
      if (!os.exists || os.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
      const op = os.data();
      if (op.executionId && op.executionId !== expectedExecutionId)
        fail("UNVERIFIED_WORKER_OUTCOME", 403);
      if (["succeeded", "failed", "cancelled"].includes(op.state)) {
        if (op.state !== outcome) fail("SETTLEMENT_CONFLICT", 409);
        return { state: op.state, alreadySettled: true };
      }
      if (outcome === "succeeded" && op.state !== "running") fail("OPERATION_NOT_STARTED", 409);
      if (outcome === "cancelled" && op.state === "running")
        fail("WORKER_TERMINATION_REQUIRED", 409);
      const [ws, cs, bs, us, intent] = await tx.getAll(
        walletRef(uid),
        controlRef,
        budgetRef(op.cycle),
        userBudgetRef(uid, op.cycle),
        ref("outbox", operationId)
      );
      if (![ws, cs, bs, us].every(s => s.exists)) fail("ACCOUNTING_STATE_MISSING", 503);
      const w = ws.data(),
        c = cs.data(),
        b = bs.data(),
        u = us.data();
      w.reserved -= op.credits;
      w.activeOperations--;
      c.activeOperations--;
      b.reservedMicros -= op.maxCostMicros;
      u.reservedMicros -= op.maxCostMicros;
      // Once started, a failed worker still costs money. Charge the conservative entire
      // resource ceiling to the financial budget, even when refunding user credits.
      if (op.state === "running") {
        b.spentMicros = checkedAdd(b.spentMicros, op.maxCostMicros);
        u.spentMicros = checkedAdd(u.spentMicros, op.maxCostMicros);
      }
      if (c.lifetimeSpendMicros !== undefined) {
        c.lifetimeReservedMicros -= op.maxCostMicros;
        integer(c.lifetimeReservedMicros, "LIFETIME_RESERVATION");
        if (op.state === "running")
          c.lifetimeSpentMicros = checkedAdd(c.lifetimeSpentMicros, op.maxCostMicros);
      }
      let releasedCredits = 0;
      let expiredCredits = 0;
      if (outcome === "succeeded") w.totals.consumed = checkedAdd(w.totals.consumed, op.credits);
      else {
        // Holding queued work over renewal must not turn an expiring allowance into
        // permanent credits. Only a confirmed failure of started work gets compensation.
        if (month(now()) !== op.cycle && op.state !== "running") expiredCredits = op.fromExpiring;
        releasedCredits = op.credits - expiredCredits;
        w.balance = checkedAdd(w.balance, releasedCredits);
        if (w.cycle === op.cycle && month(now()) === op.cycle) {
          w.expiring = checkedAdd(w.expiring, op.fromExpiring);
          w.permanent = checkedAdd(w.permanent, op.fromPermanent);
        } else w.permanent = checkedAdd(w.permanent, releasedCredits);
        w.totals.refunded = checkedAdd(w.totals.refunded, releasedCredits);
        w.totals.expired = checkedAdd(w.totals.expired, expiredCredits);
      }
      checkWallet(w);
      for (const value of [c.activeOperations, b.reservedMicros, u.reservedMicros])
        integer(value, "ACCOUNTING_STATE");
      tx.set(walletRef(uid), w);
      tx.set(controlRef, c);
      tx.set(budgetRef(op.cycle), b);
      tx.set(userBudgetRef(uid, op.cycle), u);
      tx.update(os.ref, { state: outcome, settledAt: now() });
      if (intent.exists) tx.update(intent.ref, { state: outcome, settledAt: now() });
      ledger(tx, [operationId, "settle"], {
        userId: uid,
        kind: outcome === "succeeded" ? "consumption" : "release",
        source: outcome === "succeeded" ? "consumed" : "refunded",
        operationId,
        amount: outcome === "succeeded" ? op.credits : releasedCredits,
        reservationCredits: op.credits,
        expiredCredits,
        infrastructureMicros: op.state === "running" ? op.maxCostMicros : 0,
      });
      return {
        state: outcome,
        alreadySettled: false,
        balance: w.balance,
        refunded: releasedCredits,
        expired: expiredCredits,
      };
    });
  }
  async function beginReward(uid) {
    guard();
    if (policy.rewardsDisabled === true) fail("REWARDS_PAUSED", 503);
    const sessionId = crypto.randomUUID();
    return db.runTransaction(async tx => {
      const ctx = await context(tx, uid);
      renew(tx, ctx);
      const { w, c, b } = ctx;
      if (!c.rewardsEnabled || !c.issuanceEnabled) fail("REWARDS_PAUSED", 503);
      if (w.tier !== "free") fail("SUBSCRIBER_AD_FREE", 409);
      if (w.activeReward) fail("REWARD_IN_PROGRESS", 409);
      if (w.adsAwarded >= policy.rewardMonthlyCap) fail("MONTHLY_AD_CAP", 429);
      if (w.balance + w.reserved + policy.rewardCredits > policy.maxBalance)
        fail("WALLET_CAP", 409);
      const liabilityMicros = checkedMultiply(policy.rewardCredits, policy.microsPerCredit);
      if (
        checkedAdd(checkedAdd(b.issuedMicros, b.pendingRewardMicros), liabilityMicros) >
        policy.monthlyIssuanceMicros
      )
        fail("ISSUANCE_BUDGET_EXCEEDED", 429);
      b.pendingRewardMicros = checkedAdd(b.pendingRewardMicros, liabilityMicros);
      w.activeReward = sessionId;
      w.pendingRewardCredits = policy.rewardCredits;
      const session = {
        sessionId,
        userId: uid,
        cycle: ctx.cycle,
        credits: policy.rewardCredits,
        liabilityMicros,
        state: "pending",
        createdAt: now(),
        expiresAt: now() + policy.rewardTtlSeconds * 1000,
      };
      save(tx, ctx);
      tx.create(ref("reward_sessions", sessionId), session);
      return { ...session, sandbox: true };
    });
  }
  async function closeReward(uid, sessionId) {
    guard();
    identifier(sessionId);
    return db.runTransaction(async tx => {
      const ss = await tx.get(ref("reward_sessions", sessionId));
      if (!ss.exists || ss.data().userId !== uid) fail("REWARD_NOT_FOUND", 404);
      const session = ss.data();
      if (session.state !== "pending") return { state: session.state };
      const [ws, bs] = await tx.getAll(walletRef(uid), budgetRef(session.cycle));
      if (!ws.exists || !bs.exists) fail("ACCOUNTING_STATE_MISSING", 503);
      const w = ws.data(),
        b = bs.data();
      if (w.activeReward !== sessionId) fail("REWARD_STATE_CONFLICT", 409);
      w.activeReward = null;
      w.pendingRewardCredits = 0;
      b.pendingRewardMicros -= session.liabilityMicros;
      integer(b.pendingRewardMicros, "REWARD_LIABILITY");
      tx.set(walletRef(uid), w);
      tx.set(budgetRef(session.cycle), b);
      const state =
        now() >= session.expiresAt || month(now()) !== session.cycle ? "expired" : "cancelled";
      tx.update(ss.ref, { state });
      return { state };
    });
  }
  async function completeReward(proof) {
    guard();
    const verified = verifier.verify(proof); // No browser flags/timers or Google client events accepted.
    if (verified.provider !== "local-mock") fail("UNVERIFIED_REWARD", 403);
    const { userId: uid, sessionId, eventId, completedAt } = verified;
    const eventRef = ref("events", id("local-mock", eventId));
    return db.runTransaction(async tx => {
      const [ctx, ss, es] = await Promise.all([
        context(tx, uid),
        tx.get(ref("reward_sessions", sessionId)),
        tx.get(eventRef),
      ]);
      if (es.exists) {
        if (es.data().userId !== uid || es.data().sessionId !== sessionId)
          fail("EVENT_CONFLICT", 409);
        return { alreadyAwarded: true };
      }
      if (!ss.exists || ss.data().userId !== uid) fail("REWARD_NOT_FOUND", 404);
      const s = ss.data();
      if (s.state !== "pending" || ctx.w.activeReward !== sessionId)
        fail("REWARD_ALREADY_CLOSED", 409);
      if (
        ctx.cycle !== s.cycle ||
        now() >= s.expiresAt ||
        completedAt < s.createdAt ||
        completedAt > now() ||
        completedAt >= s.expiresAt
      )
        fail("REWARD_EXPIRED", 409);
      if (ctx.w.tier !== "free" || ctx.w.adsAwarded >= policy.rewardMonthlyCap)
        fail("MONTHLY_AD_CAP", 429);
      // Honour an already promised mock reward even if new issuance is paused.
      ctx.b.pendingRewardMicros -= s.liabilityMicros;
      integer(ctx.b.pendingRewardMicros, "REWARD_LIABILITY");
      ctx.b.issuedMicros = checkedAdd(ctx.b.issuedMicros, s.liabilityMicros);
      ctx.w.balance = checkedAdd(ctx.w.balance, s.credits);
      ctx.w.expiring = checkedAdd(ctx.w.expiring, s.credits);
      ctx.w.totals.earned = checkedAdd(ctx.w.totals.earned, s.credits);
      ctx.w.adsAwarded++;
      ctx.w.activeReward = null;
      ctx.w.pendingRewardCredits = 0;
      save(tx, ctx);
      tx.update(ss.ref, { state: "awarded", eventId, completedAt });
      tx.create(eventRef, { userId: uid, sessionId, eventId });
      ledger(tx, ["reward", sessionId], {
        userId: uid,
        kind: "reward",
        source: "earned",
        amount: s.credits,
        eventId,
        sessionId,
      });
      return { alreadyAwarded: false, balance: ctx.w.balance, earned: s.credits };
    });
  }
  return {
    policy,
    initialiseControl,
    enroll,
    getAccount,
    grantPurchased,
    quote: (operation, units) => {
      guard();
      return quoteOperation(policy, operation, units);
    },
    reserve,
    start,
    getOperation,
    attachExecution,
    settle,
    beginReward,
    closeReward,
    completeReward,
  };
}
module.exports = { createWalletService };
