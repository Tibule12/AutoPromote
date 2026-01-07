/* Minimal PayPal service wrapper
 * - Uses PayPal REST API to create/capture orders and verify webhooks.
 * - Uses environment variables: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE
 */
const fetch = require("node-fetch");

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_MODE = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();

function paypalBase() {
  return PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET)
    throw new Error("PayPal credentials not configured");
  const url = `${paypalBase()}/v1/oauth2/token`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("PayPal token error: " + resp.status + " " + t);
  }
  const j = await resp.json();
  return j.access_token;
}

async function createOrder({ intent = "CAPTURE", purchase_units = [] }) {
  const token = await getAccessToken();
  const url = `${paypalBase()}/v2/checkout/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ intent, purchase_units }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("PayPal createOrder failed: " + res.status + " " + t);
  }
  return res.json();
}

async function captureOrder(orderId) {
  const token = await getAccessToken();
  const url = `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("PayPal captureOrder failed: " + res.status + " " + t);
  }
  return res.json();
}

async function verifyWebhook(req) {
  // Verify PayPal webhook signature using PayPal API
  // Requires PAYPAL_WEBHOOK_ID env var (recommended). If not set, return { verified: false, reason }
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";
  if (!webhookId) return { verified: false, reason: "no_webhook_id" };
  try {
    const token = await getAccessToken();
    const url = `${paypalBase()}/v1/notifications/verify-webhook-signature`;
    const body = {
      auth_algo: req.headers["paypal-auth-algo"] || req.body.auth_algo || "",
      cert_url: req.headers["paypal-cert-url"] || req.body.cert_url || "",
      transmission_id: req.headers["paypal-transmission-id"] || req.body.transmission_id || "",
      transmission_sig: req.headers["paypal-transmission-sig"] || req.body.transmission_sig || "",
      transmission_time:
        req.headers["paypal-transmission-time"] || req.body.transmission_time || "",
      webhook_id: webhookId,
      webhook_event: req.body,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { verified: false, reason: "paypal_verify_api_error", status: res.status, detail: t };
    }
    const j = await res.json();
    return { verified: j.verification_status === "SUCCESS", detail: j };
  } catch (e) {
    return { verified: false, reason: "exception", error: e && e.message };
  }
}

module.exports = { createOrder, captureOrder, verifyWebhook };
