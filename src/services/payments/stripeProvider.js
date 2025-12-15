const { PaymentProvider } = require("./providerInterface");
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
} catch (_) {}

class StripeProvider extends PaymentProvider {
  constructor() {
    super("stripe");
  }

  async createOnboardingLink(user) {
    if (!stripe) return { ok: false, provider: "stripe", error: "stripe_not_configured" };
    if (!user.stripeAccountId) return { ok: false, error: "missing_account_id" };
    try {
      const link = await stripe.accounts.createLoginLink(user.stripeAccountId, {
        redirect_url: process.env.STRIPE_ONBOARD_RETURN_URL,
      });
      return { ok: true, url: link.url, expires_at: link.expires_at };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async getAccountStatus(user) {
    if (!stripe) return { ok: false, provider: "stripe", error: "stripe_not_configured" };
    if (!user.stripeAccountId) return { ok: true, onboarded: false };
    try {
      const acct = await stripe.accounts.retrieve(user.stripeAccountId);
      const reqs = acct.requirements || {};
      const currentlyDue = reqs.currently_due || [];
      const eventuallyDue = reqs.eventually_due || [];
      const pastDue = reqs.past_due || [];
      const pct = (() => {
        const total = new Set([...(eventuallyDue || []), ...(currentlyDue || [])]).size || 1;
        return Math.max(0, Math.min(100, Math.round(100 - (currentlyDue.length / total) * 100)));
      })();
      return {
        ok: true,
        onboarded: true,
        chargesEnabled: !!acct.charges_enabled,
        payoutsEnabled: !!acct.payouts_enabled,
        requirements: {
          currentlyDue,
          eventuallyDue,
          pastDue,
          disabledReason: reqs.disabled_reason || null,
        },
        pctComplete: pct,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = { StripeProvider };
