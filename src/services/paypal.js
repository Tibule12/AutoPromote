const fetch = require("node-fetch");

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";

async function getAccessToken() {
  const url = `${PAYPAL_API_BASE}/v1/oauth2/token`;
  const body = "grant_type=client_credentials";
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`failed_get_token:${res.status} ${txt}`);
  }
  const j = await res.json();
  return j.access_token;
}

async function createOrder({ amount = "1.00", currency = "USD" } = {}) {
  const token = await getAccessToken();
  const url = `${PAYPAL_API_BASE}/v2/checkout/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: currency, value: String(amount) },
        },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`create_order_failed:${res.status} ${txt}`);
  }
  return res.json();
}

async function captureOrder(orderId) {
  const token = await getAccessToken();
  const url = `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`capture_failed:${res.status} ${txt}`);
  }
  return res.json();
}

async function verifyWebhookSignature({
  transmissionId,
  timestamp,
  webhookId,
  eventBody,
  certUrl,
  authAlgo,
  transmissionSig,
}) {
  const token = await getAccessToken();
  const url = `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`;
  const body = {
    transmission_id: transmissionId,
    transmission_time: timestamp,
    cert_url: certUrl,
    auth_algo: authAlgo,
    transmission_sig: transmissionSig,
    webhook_id: webhookId,
    webhook_event: eventBody,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`verify_failed:${res.status} ${txt}`);
  }
  const j = await res.json();
  return j && j.verification_status === "SUCCESS";
}

module.exports = {
  createOrder,
  captureOrder,
  verifyWebhookSignature,
};
