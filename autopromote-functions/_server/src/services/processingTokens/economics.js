const { integer, fail } = require("../unifiedCredits/policy");
const USERS = [100, 1000, 10000, 100000, 1000000];
const CONVERSION = [0, 0.01, 0.03, 0.05, 0.1, 0.2];
function calculate(input) {
  if (
    input.currency !== "USD" ||
    input.advertisingRevenueMicros !== 0 ||
    input.investmentMicros !== 0
  )
    fail("BASELINE_MUST_BE_USD_WITH_ZERO_SUBSIDY_REVENUE");
  for (const name of ["priceMicros", "feeBasisPoints", "feeFixedMicros", "fixedMonthlyMicros"])
    integer(input[name], name);
  if (input.feeBasisPoints > 10000) fail("INVALID_FEE");
  for (const plan of ["free", "plus"]) {
    for (const kind of ["average", "maximum"])
      for (const r of ["Processing", "Storage", "Network"])
        integer(input[plan]?.[kind + r + "Micros"], plan + kind + r);
    for (const resource of ["Processing", "Storage", "Network"]) {
      if (
        input[plan]["average" + resource + "Micros"] > input[plan]["maximum" + resource + "Micros"]
      )
        fail("AVERAGE_EXCEEDS_MAXIMUM");
    }
  }
  const fee = Math.ceil((input.priceMicros * input.feeBasisPoints) / 10000) + input.feeFixedMicros;
  const costs = (plan, kind) =>
    ["Processing", "Storage", "Network"].reduce(
      (sum, r) => sum + input[plan][kind + r + "Micros"],
      0
    );
  const rows = [];
  for (const users of USERS)
    for (const conversion of CONVERSION) {
      const paid = Math.round(users * conversion),
        free = users - paid;
      const revenue = paid * input.priceMicros,
        fees = paid * fee;
      const row = {
        users,
        conversion,
        freeUsers: free,
        paidUsers: paid,
        revenueMicros: revenue,
        paymentFeesMicros: fees,
        fixedMicros: input.fixedMonthlyMicros,
      };
      for (const kind of ["average", "maximum"]) {
        const freeCost = costs("free", kind),
          plusCost = costs("plus", kind);
        const infrastructure = free * freeCost + paid * plusCost + input.fixedMonthlyMicros;
        const net = revenue - fees - infrastructure;
        const denominator = input.priceMicros - fee - plusCost + freeCost;
        const breakEven =
          denominator > 0 ? (freeCost + input.fixedMonthlyMicros / users) / denominator : Infinity;
        row[kind] = {
          freeUserMicros: freeCost,
          plusUserMicros: plusCost,
          processingMicros:
            free * input.free[kind + "ProcessingMicros"] +
            paid * input.plus[kind + "ProcessingMicros"],
          storageMicros:
            free * input.free[kind + "StorageMicros"] + paid * input.plus[kind + "StorageMicros"],
          networkMicros:
            free * input.free[kind + "NetworkMicros"] + paid * input.plus[kind + "NetworkMicros"],
          totalInfrastructureMicros: infrastructure,
          contributionPerSubscriberMicros: input.priceMicros - fee - plusCost,
          contributionMarginPercent:
            (100 * (input.priceMicros - fee - plusCost)) / input.priceMicros,
          netMicros: net,
          requiredSubsidyMicros: Math.max(0, -net),
          breakEvenConversion: breakEven <= 1 ? breakEven : null,
          worstCaseExposureMicros: kind === "maximum" ? infrastructure + fees : undefined,
        };
      }
      // Rolling 30-day expenditure does not imply the same calendar-month maximum.
      // A 31-day month can admit one extra renewal window at its boundary.
      const { SUBSCRIPTION_PLANS } = require("../../config/subscriptionPlans");
      const extraFree = Math.min(input.free.maximumProcessingMicros, SUBSCRIPTION_PLANS.free.processing.tokens * 1000);
      const extraPlus = Math.min(input.plus.maximumProcessingMicros, SUBSCRIPTION_PLANS.plus.processing.tokens * 1000);
      const extra = free * extraFree + paid * extraPlus;
      row.calendar31DayStress = {
        extraProcessingMicros: extra,
        totalInfrastructureMicros: row.maximum.totalInfrastructureMicros + extra,
        requiredSubsidyMicros: Math.max(0, row.maximum.totalInfrastructureMicros + extra + fees - revenue),
        worstCaseExposureMicros: row.maximum.totalInfrastructureMicros + extra + fees,
        basis: "One additional renewal-window liability beyond a rolling 30-day bound; monthly subscription revenue unchanged.",
      };
      rows.push(row);
    }
  return {
    periodDays: 30,
    basis: input.basis,
    currency: "USD",
    inputs: input,
    perSubscriberFeeMicros: fee,
    scenarios: rows,
  };
}
module.exports = { calculate, USERS, CONVERSION };
