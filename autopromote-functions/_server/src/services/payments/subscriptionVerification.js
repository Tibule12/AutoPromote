// Payment security can ship with the existing public catalog independently of
// the Free/Plus migration. Never invent or activate a missing plan here.
const catalog = require("../../config/subscriptionPlans");
const ALL_SUBSCRIPTION_PLANS = catalog.ALL_SUBSCRIPTION_PLANS || catalog.SUBSCRIPTION_PLANS;
const { resolvePlan } = catalog;
const { fail } = require("../unifiedCredits/policy");

function validatePlusPlanDefinition(remote, { requireActive = true } = {}) {
  const regular = (remote?.billing_cycles || []).filter(c => c.tenure_type === "REGULAR");
  const c = regular[0], price = c?.pricing_scheme?.fixed_price;
  if ((requireActive ? remote?.status !== "ACTIVE" : !['ACTIVE','CREATED','INACTIVE'].includes(remote?.status)) || regular.length !== 1 || remote.billing_cycles.length !== 1 ||
      price?.currency_code !== "USD" || Number(price.value) !== Number(resolvePlan("plus").price) ||
      c.frequency?.interval_unit !== "MONTH" || c.frequency?.interval_count !== 1 ||
      c.sequence !== 1 || c.total_cycles !== 0 || remote.quantity_supported === true ||
      Number(remote.taxes?.percentage || 0) !== 0 ||
      remote.payment_preferences?.auto_bill_outstanding === true ||
      Number(remote.payment_preferences?.setup_fee?.value || 0) !== 0)
    fail("PAYPAL_PLUS_TERMS_MISMATCH", 503);
}

function verifiedSubscription({
  userId,
  subscriptionId,
  remote,
  intent,
  env = process.env,
  now = Date.now(),
}) {
  if (!/^I-[A-Z0-9]+$/i.test(subscriptionId || "") || remote?.id !== subscriptionId)
    fail("INVALID_SUBSCRIPTION", 400);
  if (remote.status !== "ACTIVE") fail("SUBSCRIPTION_NOT_PAID", 409);
  if (intent?.status === "superseded") fail("CHECKOUT_SUPERSEDED", 409);
  if (intent && intent.userId !== userId) fail("SUBSCRIPTION_OWNER_MISMATCH", 403);
  if (remote.custom_id !== userId && !(intent?.userId === userId && !remote.custom_id))
    fail("SUBSCRIPTION_OWNER_MISMATCH", 403);
  if (remote.custom_id && remote.custom_id !== userId) fail("SUBSCRIPTION_OWNER_MISMATCH", 403);
  const plan = Object.values(ALL_SUBSCRIPTION_PLANS).find(
    p => p.paypalPlanIdEnv && env[p.paypalPlanIdEnv] && env[p.paypalPlanIdEnv] === remote.plan_id
  );
  if (!plan || (intent?.planId && intent.planId !== plan.id))
    fail("SUBSCRIPTION_PLAN_MISMATCH", 409);
  const payment = remote.billing_info?.last_payment;
  const expires = Date.parse(remote.billing_info?.next_billing_time || "");
  // ACTIVE can survive failed collection attempts. A later billing date must
  // not turn an old Plus payment into proof that its new monthly period paid.
  let oldestPlusPayment = -Infinity;
  if (plan.id === "plus" && Number.isFinite(expires)) {
    const end = new Date(expires);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1,
      end.getUTCHours(), end.getUTCMinutes(), end.getUTCSeconds(), end.getUTCMilliseconds()));
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(end.getUTCDate(), lastDay));
    oldestPlusPayment = start.getTime() - 86400000; // Bounded provider processing tolerance.
  }
  if (
    !payment ||
    payment.amount?.currency_code !== "USD" ||
    (plan.id === "plus" ? Number(payment.amount.value) !== Number(plan.price) : Number(payment.amount.value) <= 0) ||
    !Number.isFinite(Date.parse(payment.time || "")) ||
    Date.parse(payment.time) > now ||
    Date.parse(payment.time) < oldestPlusPayment ||
    !Number.isFinite(expires) ||
    expires <= now
  )
    fail("VERIFIED_PAYMENT_REQUIRED", 409);
  return {
    planId: plan.id,
    nextBillingDate: new Date(expires).toISOString(),
    paymentTime: payment.time,
  };
}

async function persistVerifiedSubscription({
  db,
  userId,
  subscriptionId,
  paypalSub,
  intent,
  env = process.env,
  now = Date.now(),
  readPaymentResource,
  paymentProof,
}) {
  const v = verifiedSubscription({ userId, subscriptionId, remote: paypalSub, intent, env, now });
  if (v.planId === "plus" && env.PAYPAL_MODE === "live") {
    if (!paymentProof) {
      if (!readPaymentResource) fail("PAYMENT_TRANSACTION_PROOF_REQUIRED", 503);
      paymentProof = await require("./paymentProof").readCurrentPaymentProof({
        subscriptionId, remote:paypalSub, read:readPaymentResource, now });
    }
    if (!/^[A-Z0-9-]{5,100}$/i.test(paymentProof.transactionId || "") ||
        paymentProof.paymentTime !== v.paymentTime || paymentProof.status !== "COMPLETED" ||
        paymentProof.currency !== "USD" || Number(paymentProof.amount) !== 4.99)
      fail("PAYMENT_TRANSACTION_PROOF_REQUIRED", 409);
  }
  const plan = resolvePlan(v.planId),
    timestamp = new Date(now).toISOString();
  return db.runTransaction(async tx => {
    const claimRef = db.collection("paypal_subscription_claims").doc(subscriptionId);
    const eventId = require("node:crypto")
      .createHash("sha256")
      .update(subscriptionId + ":" + v.paymentTime)
      .digest("hex");
    const eventRef = db.collection("subscription_events").doc(eventId);
    // A sale can be refunded before activation. Its immutable provider ID is
    // authoritative even when subscription/sale timestamps differ slightly.
    const saleRef = paymentProof && db.collection("subscription_events").doc(require("node:crypto")
      .createHash("sha256").update(subscriptionId + ":sale:" + paymentProof.transactionId).digest("hex"));
    const [claim, event, current, sale] = await tx.getAll(
      claimRef,
      eventRef,
      db.collection("user_subscriptions").doc(userId),
      ...(saleRef ? [saleRef] : [])
    );
    if (claim.exists && claim.data().userId !== userId) fail("SUBSCRIPTION_ALREADY_CLAIMED", 403);
    // A delayed payment replay must not replace a newer agreement.
    if (event.data()?.revoked === true || sale?.data()?.revoked === true) fail("PAYMENT_REVOKED", 409);
    const existing = current.data() || {};
    if (Date.parse(existing.nextBillingDate || "") > Date.parse(v.nextBillingDate)) fail("STALE_SUBSCRIPTION", 409);
    if (
      existing.paypalSubscriptionId &&
      existing.paypalSubscriptionId !== subscriptionId &&
      Date.parse(existing.updatedAt || "") > Date.parse(paypalSub.create_time || "")
    )
      fail("STALE_SUBSCRIPTION", 409);
    if (event.exists && claim.exists && existing.status === "active" &&
        existing.paymentVerified === true && existing.paypalSubscriptionId === subscriptionId &&
        existing.planId === v.planId && existing.nextBillingDate === v.nextBillingDate) {
      return { planId:v.planId, planName:plan.name, status:"active", nextBillingDate:v.nextBillingDate };
    }
    const common = {
      status: "active",
      provider: "paypal",
      paymentVerified: true,
      paypalSubscriptionId: subscriptionId,
      nextBillingDate: v.nextBillingDate,
      expiresAt: v.nextBillingDate,
      verifiedAt: timestamp,
      lastPaymentTime: v.paymentTime,
      ...(paymentProof ? { lastPaymentSaleId:paymentProof.transactionId } : {}),
      updatedAt: timestamp,
    };
    tx.set(claimRef, { userId, planId: v.planId, claimedAt: claim.data()?.claimedAt || timestamp });
    tx.set(
      db.collection("users").doc(userId),
      {
        subscriptionTier: v.planId,
        subscriptionStatus: "active",
        subscriptionPeriodEnd: v.nextBillingDate,
        subscriptionExpiresAt: v.nextBillingDate,
        paypalSubscriptionId: subscriptionId,
        isPaid: true,
        unlimited: false,
        updatedAt: timestamp,
      },
      { merge: true }
    );
    tx.set(
      db.collection("user_billing").doc(userId),
      { ...common, tier: v.planId },
      { merge: true }
    );
    tx.set(
      db.collection("user_subscriptions").doc(userId),
      {
        ...common,
        userId,
        planId: v.planId,
        planName: plan.name,
        amount: Number(paypalSub.billing_info.last_payment.amount.value),
        currency: "USD",
      },
      { merge: true }
    );
    tx.set(
      db.collection("subscription_intents").doc(subscriptionId),
      { userId, planId: v.planId, status: "activated", activatedAt: timestamp },
      { merge: true }
    );
    if (!event.exists) tx.create(eventRef, {
      userId,
      type: "verified_subscription_payment",
      subscriptionId,
      planId: v.planId,
      paymentTime: v.paymentTime,
      timestamp,
    });
    return {
      planId: v.planId,
      planName: plan.name,
      status: "active",
      nextBillingDate: v.nextBillingDate,
    };
  });
}

async function persistSubscriptionEnd({
  db,
  userId,
  subscriptionId,
  status,
  eventId,
  now = Date.now(),
}) {
  const normalized = String(status).toLowerCase();
  if (!["cancelled", "suspended", "expired"].includes(normalized))
    fail("INVALID_SUBSCRIPTION_STATE");
  const id = require("node:crypto")
    .createHash("sha256")
    .update(subscriptionId + ":" + eventId)
    .digest("hex");
  return db.runTransaction(async tx => {
    const subscriptionRef = db.collection("user_subscriptions").doc(userId);
    const userRef = db.collection("users").doc(userId),
      billingRef = db.collection("user_billing").doc(userId);
    const eventRef = db.collection("subscription_events").doc(id);
    const [subscription, user, _billing, event] = await tx.getAll(
      subscriptionRef,
      userRef,
      billingRef,
      eventRef
    );
    if (event.exists) return { duplicate: true };
    if (subscription.data()?.paypalSubscriptionId !== subscriptionId)
      fail("STALE_SUBSCRIPTION", 409);
    const expiresAt =
      normalized === "cancelled"
        ? subscription.data().nextBillingDate ||
          user.data()?.subscriptionPeriodEnd ||
          new Date(now).toISOString()
        : new Date(now).toISOString();
    const timestamp = new Date(now).toISOString();
    tx.set(
      subscriptionRef,
      { status: normalized, expiresAt, cancelledAt: timestamp, updatedAt: timestamp },
      { merge: true }
    );
    tx.set(
      userRef,
      {
        subscriptionStatus: normalized,
        subscriptionExpiresAt: expiresAt,
        subscriptionPeriodEnd: expiresAt,
        subscriptionCancelledAt: timestamp,
        updatedAt: timestamp,
      },
      { merge: true }
    );
    tx.set(
      billingRef,
      { status: normalized, expiresAt, nextBillingDate: expiresAt, updatedAt: timestamp },
      { merge: true }
    );
    tx.create(eventRef, {
      userId,
      subscriptionId,
      type: "verified_subscription_" + normalized,
      timestamp,
    });
    return { status: normalized, expiresAt };
  });
}

async function verifyPayPalWebhook({
  headers,
  event,
  webhookId,
  accessToken,
  fetchImpl = fetch,
  mode = process.env.PAYPAL_MODE,
}) {
  const names = [
    "auth-algo",
    "cert-url",
    "transmission-id",
    "transmission-sig",
    "transmission-time",
  ];
  if (!webhookId || !event?.id || names.some(name => !headers["paypal-" + name])) return false;
  const base = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const response = await fetchImpl(base + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: event,
    }),
    signal: AbortSignal.timeout(15000),
  });
  return response.ok && (await response.json()).verification_status === "SUCCESS";
}
module.exports = {
  validatePlusPlanDefinition,
  verifiedSubscription,
  persistVerifiedSubscription,
  persistSubscriptionEnd,
  verifyPayPalWebhook,
};
