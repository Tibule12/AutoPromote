// payments/index.js - provider aggregator & status composer
const { PayPalProvider } = require("./paypalProvider");
const { ManualProvider } = require("./manualProvider");
let PayFastProvider;
let PayGateProvider;
try {
  PayFastProvider = require("./payfastProvider").PayFastProvider;
} catch (e) {
  PayFastProvider = null;
}
try {
  PayGateProvider = require("./paygateProvider").PayGateProvider;
} catch (e) {
  PayGateProvider = null;
}

const providers = {};
function initProviders() {
  providers.paypal = new PayPalProvider();
  if (process.env.ENABLE_MANUAL_PROVIDER === "true") providers.manual = new ManualProvider();
  if (process.env.ENABLE_PAYFAST === "true" && PayFastProvider)
    providers.payfast = new PayFastProvider();
  if (process.env.ENABLE_PAYGATE === "true" && PayGateProvider)
    providers.paygate = new PayGateProvider();
}
initProviders();

function guardLiveCalls() {
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_LIVE_PAYMENTS !== "true") {
    return {
      liveCallsBlocked: true,
      reason: "Set ALLOW_LIVE_PAYMENTS=true to enable provider live calls in non-production.",
    };
  }
  return { liveCallsBlocked: false };
}

async function composeStatus(userDoc) {
  const user = userDoc || {};
  const out = {};
  for (const [name, prov] of Object.entries(providers)) {
    try {
      out[name] = await prov.getAccountStatus(user);
    } catch (e) {
      out[name] = { ok: false, error: e.message };
    }
  }
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
  const payoutsEnabled = process.env.PAYOUTS_ENABLED === "true";
  const guard = guardLiveCalls();
  return { paymentsEnabled, payoutsEnabled, providers: out, ...guard };
}

module.exports = { providers, composeStatus, guardLiveCalls };
