const { fail, integer } = require("../unifiedCredits/policy");
function checkoutOrigins({ returnUrl, cancelUrl }, env = process.env) {
  let home;
  try { home = new URL(env.FRONTEND_URL); } catch { fail("CHECKOUT_ORIGIN_NOT_CONFIGURED", 503); }
  const local = env.NODE_ENV === "test" && ["localhost", "127.0.0.1"].includes(home.hostname);
  if ((!local && home.protocol !== "https:") || home.username || home.password || home.hash)
    fail("CHECKOUT_ORIGIN_NOT_CONFIGURED", 503);
  const validate = value => {
    let url;
    try { url = new URL(value || "/pricing", home.origin); } catch { fail("INVALID_CHECKOUT_RETURN", 400); }
    if (url.origin !== home.origin || url.pathname !== "/pricing" || url.username || url.password || url.hash || url.search)
      fail("INVALID_CHECKOUT_RETURN", 400);
    return url.href;
  };
  return { returnUrl: validate(returnUrl), cancelUrl: validate(cancelUrl) };
}
async function assertPurchaseCapacity(service, env = process.env) {
  // Enough funded headroom for at least the largest approved useful workflow.
  const required = Number(env.PLUS_PURCHASE_CAPACITY_MICROS || 1070000);
  integer(required, "PURCHASE_CAPACITY", 1);
  if (!(await service.purchaseCapacity(required)).available)
    fail("FUNDED_CAPACITY_UNAVAILABLE", 503);
}
module.exports = { checkoutOrigins, assertPurchaseCapacity };
