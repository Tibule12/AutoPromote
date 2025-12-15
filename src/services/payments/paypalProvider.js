const { PaymentProvider } = require("./providerInterface");

// Placeholder PayPal provider; real implementation will require OAuth token fetch & payouts API.
class PayPalProvider extends PaymentProvider {
  constructor() {
    super("paypal");
  }
  async getAccountStatus(user) {
    // Without credentials yet, return pending status.
    return {
      ok: true,
      onboarded: !!user.paypalBusinessConfigured,
      payoutsEnabled: !!user.paypalPayoutsLive,
      pending: !user.paypalPayoutsLive,
    };
  }
}

module.exports = { PayPalProvider };
