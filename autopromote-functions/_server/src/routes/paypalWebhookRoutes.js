const express = require("express");
const router = express.Router();
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const paypalPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PAYPAL_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "paypal_public",
});
const paypalWebhookLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PAYPAL_WEBHOOK || "300", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "50"),
  windowHint: "paypal_webhook",
});
const { db } = require("../firebaseAdmin");
let codeqlLimiter;
try {
  codeqlLimiter = require("../middlewares/codeqlRateLimit");
} catch (_) {
  codeqlLimiter = null;
}
const { audit } = require("../services/auditLogger");
let paypalSdk;
try {
  paypalSdk = require("@paypal/paypal-server-sdk");
} catch (_) {
  /* optional */
}
const authMiddleware = require("../authMiddleware");
const rateLimit = require("../middlewares/simpleRateLimit");

const { safeFetch } = require("../utils/ssrfGuard");
// Polyfill / select fetch implementation (Render may run Node < 18 in some cases)
let fetchFn = typeof fetch === "function" ? fetch : null;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    console.warn(
      "⚠️ node-fetch not available and global fetch missing; PayPal routes will fail until fetch is provided."
    );
  }
}

// Minimal in-memory OAuth token cache (because we already keep secrets in env)
let __tokenCache = { token: null, expiresAt: 0 };
async function getAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
    throw new Error("paypal_creds_missing");
  const now = Date.now();
  if (__tokenCache.token && __tokenCache.expiresAt > now + 5000) return __tokenCache.token;
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  if (!fetchFn) throw new Error("fetch_unavailable");
  // Use safeFetch for SSRF protection (module-level import used)
  const res = await safeFetch(base + "/v1/oauth2/token", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
  });
  if (!res.ok) throw new Error("token_http_" + res.status);
  const json = await res.json();
  __tokenCache = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return __tokenCache.token;
}

async function _createOrder({ amount, currency = "USD", internalId, userId }) {
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const access = await getAccessToken();
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      { amount: { currency_code: currency, value: amount.toFixed(2) }, reference_id: internalId },
    ],
    application_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
  };
  if (!fetchFn) throw new Error("fetch_unavailable");
  const res = await safeFetch(base + "/v2/checkout/orders", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
  });
  const json = await res.json();
  if (res.status >= 400) throw new Error(json.message || "order_create_failed");
  // Persist initial payment doc
  try {
    await db.collection("payments").doc(json.id).set(
      {
        provider: "paypal",
        providerOrderId: json.id,
        status: "created",
        amount: body.purchase_units[0].amount.value,
        currency: body.purchase_units[0].amount.currency_code,
        userId,
        internalId,
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (_) {}
  return json;
}

async function _captureOrder(orderId) {
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const access = await getAccessToken();
  if (!fetchFn) throw new Error("fetch_unavailable");
  const res = await safeFetch(base + `/v2/checkout/orders/${orderId}/capture`, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox-paypal.com"],
  });
  const json = await res.json();
  if (res.status >= 400) throw new Error(json.message || "capture_failed");
  const capture =
    json.purchase_units &&
    json.purchase_units[0] &&
    json.purchase_units[0].payments &&
    json.purchase_units[0].payments.captures &&
    json.purchase_units[0].payments.captures[0];
  try {
    await db
      .collection("payments")
      .doc(orderId)
      .set(
        {
          status: "captured",
          capturedAt: new Date().toISOString(),
          captureId: capture && capture.id,
        },
        { merge: true }
      );
  } catch (_) {}
  return json;
}

// Lightweight debug endpoint to introspect PayPal integration health
router.get("/debug/status", authMiddleware, paypalPublicLimiter, async (req, res) => {
  const hasClientId = !!process.env.PAYPAL_CLIENT_ID;
  const hasSecret = !!process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || "sandbox(default)";
  const webhookIdPresent = !!process.env.PAYPAL_WEBHOOK_ID;
  const tokenCached = !!__tokenCache.token && __tokenCache.expiresAt > Date.now();
  return res.json({
    ok: true,
    env: { hasClientId, hasSecret, mode, webhookIdPresent },
    runtime: {
      node: process.version,
      fetchAvailable: !!fetchFn,
      fetchType: fetchFn && fetchFn.name,
    },
    token: {
      cached: tokenCached,
      expiresInMs: tokenCached ? __tokenCache.expiresAt - Date.now() : null,
    },
    sdk: {
      subscriptions: !!(paypalSdk && paypalSdk.subscriptions),
      core: !!(paypalSdk && paypalSdk.core),
    },
  });
});

function rawBodyBuffer(req, _res, buf) {
  req.rawBody = buf;
}

// Middleware: parse JSON but retain raw body
router.post(
  "/webhook",
  codeqlLimiter && codeqlLimiter.webhooks ? codeqlLimiter.webhooks : (req, res, next) => next(),
  express.json({ limit: "1mb", verify: rawBodyBuffer }),
  paypalWebhookLimiter,
  rateLimit({ max: 100, windowMs: 60000, key: r => r.ip }),
  async (req, res) => {
    const transmissionId = req.get("paypal-transmission-id");
    const transmissionTime = req.get("paypal-transmission-time");
    const certUrl = req.get("paypal-cert-url");
    const authAlgo = req.get("paypal-auth-algo");
    const transmissionSig = req.get("paypal-transmission-sig");
    const webhookId = process.env.PAYPAL_WEBHOOK_ID; // must be configured
    const event = req.body || {};

    // Basic presence validation
    if (!webhookId) return res.status(500).json({ ok: false, error: "missing_webhook_id" });
    const missing = [];
    if (!transmissionId) missing.push("paypal-transmission-id");
    if (!transmissionTime) missing.push("paypal-transmission-time");
    if (!authAlgo) missing.push("paypal-auth-algo");
    if (!transmissionSig) missing.push("paypal-transmission-sig");
    if (missing.length)
      return res.status(400).json({ ok: false, error: "missing_headers", missing });

    // Verify with PayPal's authoritative endpoint; the former SHA-256/HMAC
    // development verifier did not implement PayPal's signature protocol.
    let verified = false;
    const verificationMode = "paypal-api";
    try {
      verified = await require("../services/payments/subscriptionVerification").verifyPayPalWebhook(
        {
          headers: req.headers,
          event,
          webhookId,
          accessToken: await getAccessToken(),
          fetchImpl: fetchFn,
        }
      );
    } catch (_) {
      return res.status(503).json({ ok: false, error: "verification_unavailable" });
    }

    // Reject before any Firestore writes. Unsigned Internet traffic must not
    // be able to create financial events or billable webhook-log documents.
    if (!verified) {
      return res.status(400).json({ ok: false, error: "signature_verification_failed" });
    }
    // Persist the minimal verified trail without credentials or certificate URLs.
    try {
      await db.collection("webhook_logs").add({
        provider: "paypal",
        eventType: event.event_type,
        verified,
        verificationMode,
        headers: {
          transmissionId,
          transmissionTime,
          authAlgo,
          certUrl: certUrl ? "REDACTED" : null,
        },
        receivedAt: new Date().toISOString(),
      });
    } catch (_) {}
    audit.log("paypal.webhook.received", {
      eventType: event.event_type,
      verified,
      verificationMode,
    });

    // Minimal event routing and subscription lifecycle handling
    try {
      if (["PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED"].includes(event.event_type)) {
        const lifecycle = require("../services/payments/subscriptionLifecycle");
        const base = process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
        const read = async path => {
          const response = await fetchFn(base + path, { headers: {
            Authorization: "Bearer " + await getAccessToken() }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw Error("paypal_lifecycle_read_failed");
          return response.json();
        };
        const failed = event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED";
        const status = event.event_type === "PAYMENT.SALE.REFUNDED" ? "refunded" : "reversed";
        const sale = failed ? null : await lifecycle.authoritativeAdverseSale(event.resource, status,
          id => read("/v1/payments/sale/" + encodeURIComponent(id)));
        const subscriptionId = failed ? event.resource?.id : sale.billing_agreement_id;
        if (!/^I-[A-Z0-9]+$/i.test(subscriptionId || "")) throw Error("invalid_subscription");
        const [intent, claim] = await Promise.all([
          db.collection("subscription_intents").doc(subscriptionId).get(),
          db.collection("paypal_subscription_claims").doc(subscriptionId).get()]);
        const userId = claim.data()?.userId || intent.data()?.userId;
        if (!userId) throw Error("subscription_owner_reconciliation_required");
        if (intent.data()?.userId && claim.data()?.userId && intent.data().userId !== claim.data().userId)
          throw Error("subscription_owner_conflict");
        const remote = await read("/v1/billing/subscriptions/" + encodeURIComponent(subscriptionId));
        if (remote.id !== subscriptionId || (remote.custom_id && remote.custom_id !== userId))
          throw Error("subscription_owner_conflict");
        if (failed) await lifecycle.persistFailedCollection({ db, userId, subscriptionId, eventId: event.id, remote });
        else await lifecycle.persistPaymentRevocation({ db, userId, subscriptionId, eventId: event.id,
          paymentTime: sale.create_time, providerCurrentPaymentTime: remote.billing_info?.last_payment?.time, saleId:sale.id, status });
      }
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const amount = event.resource && event.resource.amount && event.resource.amount.value;
        const currency =
          event.resource && event.resource.amount && event.resource.amount.currency_code;
        const captureId = event.resource && event.resource.id;
        const orderId =
          event.resource &&
          event.resource.supplementary_data &&
          event.resource.supplementary_data.related_ids &&
          event.resource.supplementary_data.related_ids.order_id;
        await db.collection("payment_events").doc(event.id).set({
          provider: "paypal",
          type: event.event_type,
          amount,
          currency,
          captureId,
          orderId,
          at: new Date().toISOString(),
          rawId: event.id,
        });
        if (orderId) {
          await db.collection("payments").doc(orderId).set(
            {
              status: "captured",
              captureId,
              amount,
              currency,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }

      // Every activation/renewal reads the current agreement and verifies payment.
      if (
        [
          "BILLING.SUBSCRIPTION.ACTIVATED",
          "BILLING.SUBSCRIPTION.UPDATED",
          "BILLING.SUBSCRIPTION.RE-ACTIVATED",
          "PAYMENT.SALE.COMPLETED",
          "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED",
        ].includes(event.event_type)
      ) {
        const resource = event.resource || {};
        const subscriptionId =
          resource.billing_agreement_id ||
          resource.subscription_id ||
          resource.supplementary_data?.related_ids?.subscription_id ||
          resource.id;
        if (subscriptionId && /^I-[A-Z0-9]+$/i.test(subscriptionId)) {
          const intentDoc = await db.collection("subscription_intents").doc(subscriptionId).get();
          const intent = intentDoc.data();
          if (intent?.userId) {
            const base =
              process.env.PAYPAL_MODE === "live"
                ? "https://api-m.paypal.com"
                : "https://api-m.sandbox.paypal.com";
            const read = await fetchFn(
              base + "/v1/billing/subscriptions/" + encodeURIComponent(subscriptionId),
              {
                headers: { Authorization: "Bearer " + (await getAccessToken()) },
                signal: AbortSignal.timeout(15000),
              }
            );
            if (!read.ok) throw Error("paypal_read_failed");
            const remote = await read.json();
            await require("../services/payments/subscriptionVerification").persistVerifiedSubscription(
              {
                db,
                userId: intent.userId,
                subscriptionId,
                paypalSub: remote,
                intent,
                readPaymentResource: async path => {
                  if (!path.startsWith("/v1/billing/subscriptions/")) throw Error("invalid_payment_resource");
                  const response=await fetchFn(base+path,{headers:{Authorization:"Bearer "+await getAccessToken()},signal:AbortSignal.timeout(15000)});
                  if(!response.ok) throw Error("paypal_payment_read_failed");
                  return response.json();
                },
              }
            );
          }
        }
      }

      if (
        [
          "BILLING.SUBSCRIPTION.CANCELLED",
          "BILLING.SUBSCRIPTION.SUSPENDED",
          "BILLING.SUBSCRIPTION.EXPIRED",
        ].includes(event.event_type)
      ) {
        const subscriptionId = event.resource?.id || event.resource?.subscription_id;
        if (!/^I-[A-Z0-9]+$/i.test(subscriptionId || "")) throw Error("invalid_subscription");
        const subscriptions = await db
          .collection("user_subscriptions")
          .where("paypalSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();
        const base =
          process.env.PAYPAL_MODE === "live"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";
        const read = await fetchFn(
          base + "/v1/billing/subscriptions/" + encodeURIComponent(subscriptionId),
          {
            headers: { Authorization: "Bearer " + (await getAccessToken()) },
            signal: AbortSignal.timeout(15000),
          }
        );
        if (!read.ok) throw Error("paypal_read_failed");
        const remote = await read.json();
        // Read current provider state so a delayed cancellation cannot revoke a reactivated agreement.
        if (["CANCELLED", "SUSPENDED", "EXPIRED"].includes(remote.status)) {
          for (const doc of subscriptions.docs)
            await require("../services/payments/subscriptionVerification").persistSubscriptionEnd({
              db,
              userId: doc.data().userId || doc.id,
              subscriptionId,
              status: remote.status,
              eventId: event.id,
            });
        }
      }
    } catch (error) {
      return res
        .status(error.status || 503)
        .json({ ok: false, error: error.code || "subscription_reconciliation_failed" });
    }

    return res.json({ ok: true, received: true, verified, mode: verificationMode });
  }
);

module.exports = router;
