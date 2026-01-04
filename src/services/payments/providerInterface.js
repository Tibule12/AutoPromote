// providerInterface.js - defines a minimal interface all payment providers should implement.
// Each method returns a plain object; never throw for normal business states (return { ok:false, error }) instead.

class PaymentProvider {
  constructor(name) {
    this.name = name;
  }
  async createOnboardingLink(/* user */) {
    return { ok: false, error: "not_implemented" };
  }
  async getAccountStatus(/* user */) {
    return { ok: false, error: "not_implemented" };
  }
  async createPayout(/* { userId, amount, currency } */) {
    return { ok: false, error: "not_implemented" };
  }
  async simulateSubscription(/* userId, plan */) {
    return { ok: false, error: "not_implemented" };
  }
}

module.exports = { PaymentProvider };
