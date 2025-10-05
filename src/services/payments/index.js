// payments/index.js - provider aggregator & status composer
const { StripeProvider } = require('./stripeProvider');
const { PayPalProvider } = require('./paypalProvider');
const { ManualProvider } = require('./manualProvider');

const providers = {};
function initProviders() {
  if (process.env.ENABLE_STRIPE !== 'false') providers.stripe = new StripeProvider();
  providers.paypal = new PayPalProvider();
  if (process.env.ENABLE_MANUAL_PROVIDER === 'true') providers.manual = new ManualProvider();
}
initProviders();

async function composeStatus(userDoc) {
  const user = userDoc || {};
  const out = {};
  for (const [name, prov] of Object.entries(providers)) {
    try { out[name] = await prov.getAccountStatus(user); } catch (e) { out[name] = { ok:false, error:e.message }; }
  }
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  const payoutsEnabled = process.env.PAYOUTS_ENABLED === 'true';
  return { paymentsEnabled, payoutsEnabled, providers: out };
}

module.exports = { providers, composeStatus };
