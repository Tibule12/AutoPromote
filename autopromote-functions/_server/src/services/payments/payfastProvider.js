const { PaymentProvider } = require("./providerInterface");

// Minimal PayFast provider scaffold
class PayFastProvider extends PaymentProvider {
  constructor() {
    super("payfast");
  }

  async getAccountStatus(user) {
    // Return basic availability info; real implementation should call PayFast APIs
    return {
      ok: true,
      configured: !!process.env.PAYFAST_MERCHANT_ID,
    };
  }

  async createOrder({ amount = 0, currency = "ZAR", returnUrl = null, metadata = {} } = {}) {
    // For PayFast, typically you construct a redirect form to their URL. Here we return a
    // small payload the frontend can use to redirect or POST a form to PayFast.
    const merchantId = process.env.PAYFAST_MERCHANT_ID || null;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY || null;

    if (!merchantId || !merchantKey) {
      return { success: false, error: "payfast_not_configured" };
    }

    // Build a minimal order object - real integration must sign with passphrase
    const order = {
      provider: "payfast",
      amount,
      currency,
      redirectUrl: process.env.PAYFAST_PAYMENT_URL || "https://www.payfast.co.za/eng/process",
      params: {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        amount: amount,
        item_name: metadata.item_name || "AutoPromote payment",
        return_url: returnUrl || process.env.APP_BASE_URL || "/",
      },
    };

    return { success: true, order };
  }

  async verifyNotification(req) {
    // Stub: verify PayFast IPN / notify using passphrase or remote verification
    // Real impl should validate signature and return parsed params.
    return { verified: true, data: req.body || {} };
  }
}

module.exports = { PayFastProvider };
