const { PaymentProvider } = require("./providerInterface");

// Minimal PayGate provider scaffold
class PayGateProvider extends PaymentProvider {
  constructor() {
    super("paygate");
  }

  async getAccountStatus(user) {
    return {
      ok: true,
      configured: !!process.env.PAYGATE_ID,
    };
  }

  async createOrder({ amount = 0, currency = "ZAR", returnUrl = null, metadata = {} } = {}) {
    const merchantId = process.env.PAYGATE_ID || null;
    const merchantKey = process.env.PAYGATE_KEY || null;

    if (!merchantId || !merchantKey) {
      return { success: false, error: "paygate_not_configured" };
    }

    // PayGate usually accepts server-side requests to create payment and returns a redirect URL
    const order = {
      provider: "paygate",
      amount,
      currency,
      redirectUrl: process.env.PAYGATE_PAYMENT_URL || "https://secure.paygate.co.za/pay",
      params: {
        PAYGATE_ID: merchantId,
        PAYGATE_KEY: merchantKey,
        AMOUNT: amount,
        CURRENCY: currency,
        RETURN_URL: returnUrl || process.env.APP_BASE_URL || "/",
      },
    };

    return { success: true, order };
  }

  async verifyNotification(req) {
    // Stub: implement PayGate notification verification here
    return { verified: true, data: req.body || {} };
  }
}

module.exports = { PayGateProvider };
