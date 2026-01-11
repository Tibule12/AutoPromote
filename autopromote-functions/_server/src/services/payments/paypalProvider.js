const { PaymentProvider } = require("./providerInterface");
const paypalClient = require("../paypal");

// PayPal provider implementation
class PayPalProvider extends PaymentProvider {
  constructor() {
    super("paypal");
  }

  async getAccountStatus(user) {
    // Check if user has provided a PayPal email
    return {
      ok: true,
      onboarded: !!user.paypalEmail,
      payoutsEnabled: !!user.paypalEmail,
      pending: !user.paypalEmail,
      details: { email: user.paypalEmail },
    };
  }

  async createPayout({ userId, amount, currency = "USD", receiverEmail }) {
    if (!receiverEmail) {
      return { ok: false, error: "No PayPal email provided for user" };
    }

    try {
      const result = await paypalClient.createPayoutBatch({
        items: [
          {
            receiver: receiverEmail,
            amount: String(amount),
            currency,
            note: "AutoPromote Earnings Payout",
          },
        ],
      });

      const batchId = result.batch_header.payout_batch_id;
      return { ok: true, payoutId: batchId, status: "pending", raw: result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = { PayPalProvider };
