const { integer, fail } = require("./policy");
const safe = value => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) fail("ECONOMICS_OVERFLOW");
  return Number(value);
};
const big = (value, name, min = 0) => BigInt(integer(value, name, min));

function estimateComputeMicros(input) {
  const seconds = big(input.seconds, "SECONDS", 1);
  const perSecond =
    big(input.vcpu, "VCPU", 1) * big(input.cpuNanoUsdPerSecond, "CPU_RATE", 1) +
    big(input.memoryGiB, "MEMORY", 1) * big(input.memoryNanoUsdPerSecond, "MEMORY_RATE", 1) +
    big(input.gpuNanoUsdPerSecond || 0, "GPU_RATE");
  // Round up from nanodollars to microdollars. Add separate storage/network/API costs.
  return safe((seconds * perSecond + 999n) / 1000n);
}

function analyseEconomics(input) {
  const revenue = big(input.finalizedAdRevenueMicros, "FINALISED_REVENUE");
  const overhead = big(input.adServingMicros, "AD_OVERHEAD");
  const completions = big(input.verifiedRewardCompletions, "COMPLETIONS");
  const bps = big(input.spendableBps, "SPENDABLE_FRACTION");
  if (bps > 10000n) fail("INVALID_SPENDABLE_FRACTION");
  const creditCost = big(input.microsPerCredit, "CREDIT_LIABILITY", 1);
  const net = revenue > overhead ? revenue - overhead : 0n;
  const spendable = (net * bps) / 10000n;
  const maxReward = completions > 0n ? spendable / (completions * creditCost) : 0n;
  const allowance = big(input.freeMonthlyAllowance, "ALLOWANCE");
  const adCap = big(input.monthlyAdCap, "AD_CAP");
  const reward = big(input.proposedRewardCredits, "PROPOSED_REWARD");
  const users = big(input.activeFreeUsers, "FREE_USERS");
  const subsidy = big(input.subsidyBudgetMicros, "SUBSIDY");
  const baseline = allowance * creditCost;
  const perUser = (allowance + adCap * reward) * creditCost;
  const exposure = perUser * users;
  const funded = spendable + subsidy;
  return {
    observationAvailable: completions > 0n,
    spendableFinalizedRevenueMicros: safe(spendable),
    maxRevenueFundedRewardCredits: safe(maxReward),
    proposedRewardRevenueFunded: completions > 0n && reward <= maxReward,
    baselineFreeLiabilityPerUserMicros: safe(baseline),
    maximumLiabilityPerUserMicros: safe(perUser),
    maximumMonthlyLiabilityMicros: safe(exposure),
    unfundedExposureMicros: safe(exposure > funded ? exposure - funded : 0n),
    maxActiveUsersWithinFunding: perUser > 0n ? safe(funded / perUser) : null,
    recommendation:
      completions === 0n || maxReward === 0n
        ? "Keep live rewards disabled; fund any pilot explicitly as a subsidy."
        : "Use a conservative observed revenue floor and recheck cohorts before approving a live reward.",
  };
}
module.exports = { estimateComputeMicros, analyseEconomics };
