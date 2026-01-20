const { PaymentProvider } = require("./providerInterface");
const { db } = require("../../firebaseAdmin");
const crypto = require("crypto");

function buildPayfastSignature(params = {}, passphrase) {
  // Build string of params in alphabetical order of keys
  const keys = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort();
  const pieces = keys.map(k => `${k}=${params[k]}`);
  let str = pieces.join("&");
  if (passphrase) str = str + `&passphrase=${passphrase}`;
  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

class PayFastProvider extends PaymentProvider {
  constructor() {
    super("payfast");
    this.merchantId = process.env.PAYFAST_MERCHANT_ID;
    this.merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    this.passphrase = process.env.PAYFAST_PASSPHRASE || null;
    this.mode = (process.env.PAYFAST_MODE || "live").toLowerCase();
    this.processUrl =
      process.env.PAYFAST_PROCESS_URL ||
      (this.mode === "sandbox"
        ? "https://sandbox.payfast.co.za/eng/process"
        : "https://www.payfast.co.za/eng/process");
  }

  async getAccountStatus(user) {
    return { ok: true, configured: !!this.merchantId };
  }

  async createOrder({
    amount = 0,
    currency = "ZAR",
    returnUrl = null,
    cancelUrl = null,
    notifyUrl = null,
    metadata = {},
  } = {}) {
    if (!this.merchantId || !this.merchantKey)
      return { success: false, error: "payfast_not_configured" };

    const m_payment_id = metadata.m_payment_id || `pf_${Date.now()}`;
    const params = {
      merchant_id: this.merchantId,
      merchant_key: this.merchantKey,
      return_url:
        returnUrl ||
        process.env.PAYFAST_RETURN_URL ||
        (process.env.APP_BASE_URL || "") + "/payments/return",
      cancel_url:
        cancelUrl ||
        process.env.PAYFAST_CANCEL_URL ||
        (process.env.APP_BASE_URL || "") + "/payments/cancel",
      notify_url:
        notifyUrl ||
        process.env.PAYFAST_NOTIFY_URL ||
        process.env.PAYFAST_NOTIFY_URL ||
        (process.env.APP_BASE_URL || "") + "/api/payfast/webhook",
      m_payment_id,
      amount: Number(amount).toFixed(2),
      item_name: metadata.item_name || metadata.description || "AutoPromote payment",
    };

    // Build signature
    const signature = buildPayfastSignature(params, this.passphrase);
    params.signature = signature;

    // Persist a draft payment record in Firestore (include metadata for fulfillment)
    try {
      await db
        .collection("payments")
        .doc(m_payment_id)
        .set({
          provider: "payfast",
          m_payment_id,
          amount: params.amount,
          currency,
          status: "pending",
          params,
          metadata: metadata || {},
          createdAt: new Date().toISOString(),
        });
    } catch (e) {
      // log but continue
      console.warn("PayFast createOrder: failed to persist payment draft", e && e.message);
    }

    return { success: true, order: { redirectUrl: this.processUrl, params } };
  }

  async verifyNotification(req) {
    // PayFast posts form-encoded body. We'll recompute signature and compare.
    const body = req.body || {};
    const receivedSignature = (body.signature || body.sig || body.SIGNATURE || "")
      .toString()
      .toLowerCase();
    // Remove signature before recomputing
    const copy = { ...body };
    delete copy.signature;
    delete copy.sig;
    delete copy.SIGNATURE;

    const computed = buildPayfastSignature(copy, this.passphrase);
    const verified = computed === receivedSignature;

    // Persist IPN raw payload and verification result
    try {
      const id = body.m_payment_id || body.pf_payment_id || `pf_ipn_${Date.now()}`;
      await db
        .collection("payments")
        .doc(id)
        .set(
          {
            provider: "payfast",
            m_payment_id: body.m_payment_id || null,
            pf_payment_id: body.pf_payment_id || null,
            raw: body,
            verified: !!verified,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } catch (e) {
      console.warn("PayFast verifyNotification: failed to persist ipn", e && e.message);
    }

    return { verified, data: body };
  }
}

module.exports = { PayFastProvider };
