const crypto = require("node:crypto");
const { fail } = require("../unifiedCredits/policy");
const paymentKey = (subscriptionId, time) => crypto.createHash("sha256").update(subscriptionId + ":" + time).digest("hex");

// Call only after verified provider signature AND an authoritative sale read.
async function persistPaymentRevocation({ db, userId, subscriptionId, paymentTime,
  providerCurrentPaymentTime, saleId, eventId, status, now = Date.now() }) {
  if (!["refunded", "reversed"].includes(status) || !Number.isFinite(Date.parse(paymentTime || "")) ||
      !/^I-[A-Z0-9]+$/i.test(subscriptionId || "") || !userId || !eventId)
    fail("INVALID_PAYMENT_REVOCATION", 400);
  return db.runTransaction(async tx => {
    const subscriptions = db.collection("user_subscriptions").doc(userId);
    const receipt = db.collection("subscription_events").doc(paymentKey(subscriptionId, "adverse:" + eventId));
    const [current, seen] = await tx.getAll(subscriptions, receipt);
    if (seen.exists) return { duplicate: true };
    const value = current.data() || {};
    const knownSale = saleId && value.lastPaymentSaleId === saleId;
    const latest = value.lastPaymentTime || providerCurrentPaymentTime;
    if (knownSale || Date.parse(latest || "") === Date.parse(paymentTime)) paymentTime = latest;
    const payment = db.collection("subscription_events").doc(paymentKey(subscriptionId, paymentTime));
    const paid = await tx.get(payment);
    if (paid.exists && (paid.data().userId !== userId || paid.data().subscriptionId !== subscriptionId))
      fail("PAYMENT_OWNER_MISMATCH", 403);
    const affectsCurrent = value.paypalSubscriptionId === subscriptionId &&
      (knownSale || (!value.lastPaymentSaleId && Date.parse(latest || "") === Date.parse(paymentTime)));
    const timestamp = new Date(now).toISOString();
    // A refund arriving before activation must prevent that payment granting
    // Plus later. An old-period refund must not revoke a newer paid renewal.
    tx.set(payment, { userId, subscriptionId, paymentTime, revoked: true,
      revocationStatus: status, revokedAt: timestamp }, { merge: true });
    if (saleId) tx.set(db.collection("subscription_events").doc(paymentKey(subscriptionId, "sale:" + saleId)),
      { userId, subscriptionId, saleId, revoked: true, revocationStatus: status, revokedAt: timestamp },
      { merge: true });
    if (affectsCurrent) {
      tx.set(subscriptions, { status, expiresAt: timestamp, updatedAt: timestamp }, { merge: true });
      tx.set(db.collection("user_billing").doc(userId), {
        status, paymentVerified: false, expiresAt: timestamp, nextBillingDate: timestamp,
        updatedAt: timestamp }, { merge: true });
      tx.set(db.collection("users").doc(userId), { subscriptionStatus: status,
        subscriptionPeriodEnd: timestamp, subscriptionExpiresAt: timestamp,
        updatedAt: timestamp }, { merge: true });
    }
    tx.create(receipt, { userId, subscriptionId, paymentTime, type: "verified_payment_" + status,
      eventId, affectsCurrent, at: timestamp });
    return { status, affectsCurrent };
  });
}

async function persistFailedCollection({ db, userId, subscriptionId, eventId, remote, now = Date.now() }) {
  if (remote?.id !== subscriptionId || !eventId) fail("INVALID_SUBSCRIPTION", 400);
  if (!(Number(remote.billing_info?.failed_payments_count) > 0)) return { stale: true };
  return db.runTransaction(async tx => {
    const ref = db.collection("user_subscriptions").doc(userId);
    const receipt = db.collection("subscription_events").doc(paymentKey(subscriptionId, "failed:" + eventId));
    const [current, seen] = await tx.getAll(ref, receipt);
    if (seen.exists) return { duplicate: true };
    if (current.data()?.paypalSubscriptionId !== subscriptionId) return { stale: true };
    const time = new Date(now).toISOString();
    // Preserve the last VERIFIED paid-through date. A provider retry date or
    // ACTIVE status cannot extend it or refill the allowance.
    tx.set(ref, { renewalStatus: "payment_failed", paymentFailedAt: time }, { merge: true });
    tx.set(db.collection("user_billing").doc(userId), {
      renewalStatus: "payment_failed", paymentFailedAt: time }, { merge: true });
    tx.create(receipt, { userId, subscriptionId, type: "verified_payment_failed", eventId, at: time });
    return { renewalStatus: "payment_failed", paidThrough: current.data().expiresAt || current.data().nextBillingDate };
  });
}

async function authoritativeAdverseSale(resource, kind, readSale) {
  let id = resource?.sale_id || resource?.supplementary_data?.related_ids?.sale_id;
  if (!id) {
    const link = resource?.links?.find(link => link.rel === "sale");
    const match = /^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v1\/payments\/sale\/([A-Z0-9-]+)$/i.exec(link?.href || "");
    id = match?.[1] || resource?.id;
  }
  if (!/^[A-Z0-9-]{5,100}$/i.test(id || "")) fail("PAYMENT_SALE_REQUIRED", 503);
  const sale = await readSale(id);
  const states = kind === "refunded" ? ["refunded", "partially_refunded"] : ["reversed", "refunded", "denied"];
  if (sale?.id !== id || !states.includes(String(sale.state).toLowerCase()) ||
      !/^I-[A-Z0-9]+$/i.test(sale.billing_agreement_id || "") ||
      !Number.isFinite(Date.parse(sale.create_time || ""))) fail("PAYMENT_SALE_RECONCILIATION_REQUIRED", 503);
  return sale;
}
module.exports = { persistPaymentRevocation, persistFailedCollection, authoritativeAdverseSale };
