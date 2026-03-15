const { PaymentProvider } = require("./providerInterface");
const { db } = require("../../firebaseAdmin");
const crypto = require("crypto");
/**
 * Build PayFast signature string using MD5 hash.
 *
 * NOTE: PayFast's legacy integration uses MD5 signatures for compatibility.
 * This MD5 usage is strictly for external service signing and NOT for
 * authentication or password storage.
 *
 * @param {Object} params - Key/value payload to include in signature
 * @param {string} passphrase - Optional merchant passphrase
 * @returns {string} hexadecimal MD5 signature
 */
function buildPayfastSignature(params = {}, passphrase) {
  const encodeRfc1738 = value => encodeURIComponent(String(value)).replace(/%20/g, "+");
  // Do NOT sort keys: PayFast expects parameters in the same order they are submitted.
  const keys = Object.keys(params).filter(
    k => params[k] !== undefined && params[k] !== null && params[k] !== ""
  );
  let signatureString = keys.map(k => `${k}=${encodeRfc1738(params[k])}`).join("&");
  // Include the passphrase only when it is non-empty (PayFast expects it only when set).
  const pass = passphrase == null ? "" : String(passphrase).trim();
  if (pass) {
    signatureString += `&passphrase=${encodeRfc1738(pass)}`;
  }
  if (process.env.PAYFAST_DEBUG === "true") {
    console.info("[PayFast] signature string:", signatureString);
  }
  return crypto.createHash("md5").update(signatureString, "utf8").digest("hex");
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
  async getAccountStatus() {
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
        (process.env.APP_BASE_URL || "") + "/api/payfast/notify",
      m_payment_id,
      amount: Number(amount).toFixed(2),
      item_name: metadata.item_name || metadata.description || "AutoPromote payment",
    };
    const signature = buildPayfastSignature(params, this.passphrase);
    params.signature = signature;
    if (process.env.PAYFAST_DEBUG === "true") {
      console.info("[PayFast] createOrder payload:", {
        url: this.processUrl,
        params,
        signature,
      });
    }
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
      console.warn("PayFast createOrder: failed to persist payment draft", e && e.message);
    }
    const order = {
      redirectUrl: this.processUrl,
      params,
    };
    return { success: true, order };
  }
  async verifyNotification(req) {
    const body = req.body || {};
    const receivedSignature = (body.signature || body.sig || body.SIGNATURE || "")
      .toString()
      .toLowerCase();
    const copy = { ...body };
    delete copy.signature;
    delete copy.sig;
    delete copy.SIGNATURE;
    const computed = buildPayfastSignature(copy, this.passphrase);
    const verified = computed === receivedSignature;
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
module.exports = {
  PayFastProvider,
  buildPayfastSignature,
};
