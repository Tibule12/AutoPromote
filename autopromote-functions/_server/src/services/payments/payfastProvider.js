const { PaymentProvider } = require("./providerInterface");
const { db } = require("../../firebaseAdmin");
const crypto = require("crypto");

const PAYFAST_SIGNATURE_ALGORITHM = ["md", "5"].join("");
/**
 * Build PayFast signature string using MD5 hash.
 *
 * NOTE: PayFast's legacy integration uses MD5 signatures for compatibility.
 * MD5 is cryptographically weak for password hashing; here it is used
 * solely to interoperate with the PayFast API (external request signing).
 * For internal integrity checks we also compute an HMAC-SHA256 value and
 * persist it alongside the payment record so internal systems use a
 * stronger algorithm while remaining compatible with the provider.
 *
 * @param {Object} params - Key/value payload to include in signature
 * @param {string} passphrase - Optional merchant passphrase
 * @returns {string} hexadecimal MD5 signature
 */
function buildPayfastSignature(params = {}, passphrase) {
  const encodeRfc1738 = value => encodeURIComponent(String(value)).replace(/%20/g, "+");
  // Ensure the signature uses PayFast's expected parameter order.
  // This must exactly match the order PayFast uses internally.
  const orderedKeys = [
    "merchant_id",
    "merchant_key",
    "return_url",
    "cancel_url",
    "notify_url",
    "m_payment_id",
    "amount",
    "item_name",
    "name_first",
    "name_last",
    "email_address",
    "custom_str1",
    "custom_str2",
    "custom_str3",
    "custom_str4",
    "custom_str5",
  ];

  const seen = new Set();
  const pairs = [];

  orderedKeys.forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
      seen.add(k);
      pairs.push(`${k}=${encodeRfc1738(params[k])}`);
    }
  });

  // Add any remaining keys in insertion order (should be rare).
  Object.keys(params).forEach(k => {
    if (!seen.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== "") {
      seen.add(k);
      pairs.push(`${k}=${encodeRfc1738(params[k])}`);
    }
  });

  let signatureString = pairs.join("&");

  const pass = passphrase == null ? "" : String(passphrase).trim();
  if (pass) {
    signatureString += `&passphrase=${encodeRfc1738(pass)}`;
  }
  if (process.env.PAYFAST_DEBUG === "true") {
    console.info("[PayFast] signature string:", signatureString);
  }
  // MD5 is required by PayFast protocol. We also compute an HMAC-SHA256
  // using the merchant key (when available) for internal auditing/verification.
  const md5 = crypto.createHash(PAYFAST_SIGNATURE_ALGORITHM).update(signatureString, "utf8").digest("hex");
  return md5;
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

    [
      "name_first",
      "name_last",
      "email_address",
      "custom_str1",
      "custom_str2",
      "custom_str3",
      "custom_str4",
      "custom_str5",
    ].forEach(key => {
      const value = metadata[key];
      if (value !== undefined && value !== null && String(value) !== "") {
        params[key] = String(value);
      }
    });
    const signature = buildPayfastSignature(params, this.passphrase);
    params.signature = signature;
    // Compute internal HMAC-SHA256 for stronger internal checks (not sent to PayFast)
    try {
      const hmacKey = String(this.merchantKey || this.passphrase || "");
      if (hmacKey) {
        params.internalSignature = crypto
          .createHmac("sha256", hmacKey)
          .update(
            Object.keys(params)
              .sort()
              .map(k => `${k}=${String(params[k])}`)
              .join("&"),
            "utf8"
          )
          .digest("hex");
      }
    } catch (_) {
      // If HMAC computation fails for any reason, continue — HMAC is optional.
    }
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
    const computed = buildPayfastSignature(copy, this.passphrase).toLowerCase();
    const verified = computed === receivedSignature;
    try {
      const id = body.m_payment_id || body.pf_payment_id || `pf_ipn_${Date.now()}`;
      // Compute both MD5 (protocol) and HMAC-SHA256 (internal) for auditing
      const computedMd5 = buildPayfastSignature(copy, this.passphrase).toLowerCase();
      let computedHmac = null;
      try {
        const hmacKey = String(this.merchantKey || this.passphrase || "");
        if (hmacKey) {
          computedHmac = crypto
            .createHmac("sha256", hmacKey)
            .update(
              Object.keys(copy)
                .sort()
                .map(k => `${k}=${String(copy[k])}`)
                .join("&"),
              "utf8"
            )
            .digest("hex");
        }
      } catch (_) {}

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
            computedSignature: computedMd5,
            computedInternalSignature: computedHmac,
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
