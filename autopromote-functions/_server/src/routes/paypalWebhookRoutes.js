const express = require("express");
const crypto = require("crypto");
const https = require("https");
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
/* eslint-disable-next-line no-unused-vars */
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

async function createOrder({ amount, currency = "USD", internalId, userId }) {
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

async function captureOrder(orderId) {
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

// Simple in-memory cert cache (expires after TTL)
const certCache = new Map();
const CERT_TTL_MS = parseInt(process.env.PAYPAL_CERT_TTL_MS || "3600000", 10);

function fetchCert(certUrl) {
  return new Promise((resolve, reject) => {
    try {
      if (!/^https:\/\//i.test(certUrl)) return reject(new Error("invalid_cert_url"));
      const u = new URL(certUrl);
      const allowedHosts = [
        "api-m.paypal.com",
        "api-m.sandbox.paypal.com",
        "www.paypal.com",
        "payments.paypal.com",
      ];
      if (!allowedHosts.includes(u.hostname)) return reject(new Error("invalid_cert_host"));
    } catch (e) {
      return reject(new Error("invalid_cert_url"));
    }
    const cached = certCache.get(certUrl);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return resolve(cached.pem);
    https
      .get(certUrl, res => {
        if (res.statusCode !== 200) return reject(new Error("cert_http_" + res.statusCode));
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          certCache.set(certUrl, { pem: data, expiresAt: now + CERT_TTL_MS });
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

function verifyRSASignature({ signature, sigBase, certPem, algorithm }) {
  try {
    if (!signature || !sigBase || !certPem) return false;
    const algo = (algorithm || "SHA256withRSA").toUpperCase();
    let digest = "sha256";
    if (algo.includes("SHA512")) digest = "sha512";
    const verifier = crypto.createVerify(digest.toUpperCase());
    verifier.update(sigBase, "utf8");
    verifier.end();
    const sigBuf = Buffer.from(signature, "base64");
    return verifier.verify(certPem, sigBuf);
  } catch (e) {
    return false;
  }
}

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

    // Construct expected signature base: transmissionId|transmissionTime|webhookId|sha256(body)
    let computed;
    let sigBase;
    let verified = false;
    let verificationMode = "none";
    try {
      const bodyHash = crypto
        .createHash("sha256")
        .update(req.rawBody || Buffer.from(JSON.stringify(event), "utf8"))
        .digest("hex");
      sigBase = `${transmissionId}|${transmissionTime}|${webhookId}|${bodyHash}`;
      if (process.env.PAYPAL_WEBHOOK_SECRET) {
        computed = crypto
          .createHmac("sha256", process.env.PAYPAL_WEBHOOK_SECRET)
          .update(sigBase)
          .digest("base64");
        verificationMode = "hmac-dev";
        verified = timingSafeEq(computed, transmissionSig);
      } else if (certUrl) {
        verificationMode = "rsa-cert";
        try {
          const pem = await fetchCert(certUrl);
          verified = verifyRSASignature({
            signature: transmissionSig,
            sigBase,
            certPem: pem,
            algorithm: authAlgo,
          });
        } catch (ce) {
          verificationMode = "rsa-cert-error";
        }
      } else {
        verificationMode = "no-verification";
      }
    } catch (e) {
      return res.status(400).json({ ok: false, error: "sig_compute_failed", detail: e.message });
    }

    // Persist minimal log regardless (auditable trail), avoid logging secrets in plain text
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

    if (!verified && process.env.REQUIRE_PAYPAL_WEBHOOK_VERIFICATION === "true") {
      return res.status(400).json({ ok: false, error: "signature_verification_failed" });
    }

    // Minimal event routing and subscription lifecycle handling
    try {
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
        await db.collection("payment_events").add({
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

      // Handle subscription activations and cancellations
      if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
        const subscriptionId =
          event.resource && (event.resource.id || event.resource.subscription_id);
        if (subscriptionId) {
          try {
            const intentDoc = await db.collection("subscription_intents").doc(subscriptionId).get();
            if (intentDoc.exists) {
              const intent = intentDoc.data();
              const userId = intent.userId;
              const planId = intent.planId;
              const planName = intent.planName || planId;
              const amount = intent.amount || 0;

              // Update users document
              try {
                await db
                  .collection("users")
                  .doc(userId)
                  .update({
                    subscriptionTier: planId,
                    subscriptionStatus: "active",
                    paypalSubscriptionId: subscriptionId,
                    subscriptionStartedAt: new Date().toISOString(),
                    subscriptionPeriodStart: new Date().toISOString(),
                    subscriptionPeriodEnd: new Date(
                      Date.now() + 30 * 24 * 60 * 60 * 1000
                    ).toISOString(),
                    isPaid: true,
                    updatedAt: new Date().toISOString(),
                  });
              } catch (e) {}

              // Create or update user_subscriptions doc
              try {
                await db
                  .collection("user_subscriptions")
                  .doc(userId)
                  .set(
                    {
                      userId,
                      planId,
                      planName,
                      paypalSubscriptionId: subscriptionId,
                      status: "active",
                      amount,
                      currency: "USD",
                      billingCycle: "monthly",
                      startDate: new Date().toISOString(),
                      nextBillingDate: new Date(
                        Date.now() + 30 * 24 * 60 * 60 * 1000
                      ).toISOString(),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    { merge: true }
                  );
              } catch (e) {}

              // Mark intent activated
              try {
                await db
                  .collection("subscription_intents")
                  .doc(subscriptionId)
                  .update({ status: "activated", activatedAt: new Date().toISOString() });
              } catch (e) {}

              // Log subscription event
              try {
                await db.collection("subscription_events").add({
                  userId,
                  type: "subscription_activated",
                  planId,
                  paypalSubscriptionId: subscriptionId,
                  amount,
                  timestamp: new Date().toISOString(),
                });
              } catch (e) {}
            } else {
              // No intent found; attempt to match by user_subscriptions
              const subsQuery = await db
                .collection("user_subscriptions")
                .where("paypalSubscriptionId", "==", subscriptionId)
                .limit(1)
                .get();
              if (!subsQuery.empty) {
                subsQuery.forEach(doc => {
                  doc.ref
                    .update({ status: "active", updatedAt: new Date().toISOString() })
                    .catch(() => {});
                });
              }
            }
          } catch (e) {
            console.error("[PayPal webhook] Activation handling error:", e);
          }
        }
      }

      if (
        event.event_type === "BILLING.SUBSCRIPTION.CANCELLED" ||
        event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED"
      ) {
        const subscriptionId =
          event.resource && (event.resource.id || event.resource.subscription_id);
        if (subscriptionId) {
          try {
            const subsQuery = await db
              .collection("user_subscriptions")
              .where("paypalSubscriptionId", "==", subscriptionId)
              .limit(1)
              .get();
            if (!subsQuery.empty) {
              subsQuery.forEach(doc => {
                const data = doc.data() || {};
                const userId = data.userId;
                const expiresAt =
                  data.nextBillingDate ||
                  data.expiresAt ||
                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                doc.ref
                  .update({
                    status: "cancelled",
                    cancelledAt: new Date().toISOString(),
                    expiresAt,
                    updatedAt: new Date().toISOString(),
                  })
                  .catch(() => {});
                if (userId) {
                  db.collection("users")
                    .doc(userId)
                    .update({
                      subscriptionStatus: "cancelled",
                      subscriptionCancelledAt: new Date().toISOString(),
                      subscriptionExpiresAt: expiresAt,
                      updatedAt: new Date().toISOString(),
                    })
                    .catch(() => {});
                }
              });
            }
          } catch (e) {
            console.error("[PayPal webhook] Cancellation handling error:", e);
          }
        }
      }
    } catch (_) {}

    return res.json({ ok: true, received: true, verified, mode: verificationMode });
  }
);

function timingSafeEq(a, b) {
  if (!a || !b) return false;
  const buffA = Buffer.from(a);
  const buffB = Buffer.from(b);
  if (buffA.length !== buffB.length) return false;
  return crypto.timingSafeEqual(buffA, buffB);
}

module.exports = router;
