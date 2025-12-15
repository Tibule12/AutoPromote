const { PaymentProvider } = require("./providerInterface");

// Manual provider for local dev/testing: always success.
class ManualProvider extends PaymentProvider {
  constructor() {
    super("manual");
  }
  async getAccountStatus() {
    return { ok: true, onboarded: true, payoutsEnabled: true, dev: true };
  }
  async createPayout({ userId, amount, currency }) {
    return {
      ok: true,
      payoutId: `manual_${Date.now()}`,
      userId,
      amount,
      currency,
      simulated: true,
    };
  }
}

module.exports = { ManualProvider };
