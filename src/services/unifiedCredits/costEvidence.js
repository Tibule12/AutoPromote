const { integer, fail, OPERATIONS } = require("./policy");
const COMPONENTS = [
  "cpu",
  "gpu",
  "storage",
  "egress",
  "ai",
  "publishing",
  "firestore",
  "tasks",
  "overhead",
];
function analyseCostEvidence({
  samples = [],
  microsPerCredit,
  marginBps = 3000,
  enforcedCeilingMicros = {},
}) {
  integer(microsPerCredit, "CREDIT_LIABILITY", 1);
  integer(marginBps, "MARGIN");
  if (marginBps > 10000) fail("INVALID_MARGIN");
  const seen = new Set();
  const groups = Object.fromEntries(OPERATIONS.map(name => [name, []]));
  for (const sample of samples) {
    if (
      !Object.hasOwn(groups, sample.operation) ||
      !["succeeded", "failed"].includes(sample.outcome) ||
      !["billing_export", "provider_invoice"].includes(sample.evidenceType) ||
      typeof sample.operationId !== "string" ||
      !sample.operationId ||
      seen.has(sample.operationId)
    )
      fail("INVALID_COST_EVIDENCE");
    seen.add(sample.operationId);
    let total = 0n;
    for (const component of COMPONENTS)
      total += BigInt(integer(sample.costMicros?.[component], "COST_COMPONENT"));
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail("ECONOMICS_OVERFLOW");
    groups[sample.operation].push({ total: Number(total), outcome: sample.outcome });
  }
  const operations = {};
  for (const [operation, values] of Object.entries(groups)) {
    values.sort((a, b) => a.total - b.total);
    if (!values.length) {
      operations[operation] = { samples: 0, recommendedCredits: null, status: "NEEDS_MEASUREMENT" };
      continue;
    }
    const p95 = values[Math.ceil(values.length * 0.95) - 1].total;
    const observedFloor = (BigInt(p95) * BigInt(10000 + marginBps) + 9999n) / 10000n;
    const enforced = enforcedCeilingMicros[operation];
    if (enforced !== undefined) integer(enforced, "ENFORCED_CEILING", values.at(-1).total);
    const ceiling =
      enforced !== undefined && BigInt(enforced) > observedFloor ? BigInt(enforced) : observedFloor;
    if (ceiling > BigInt(Number.MAX_SAFE_INTEGER)) fail("ECONOMICS_OVERFLOW");
    const credits = (ceiling + BigInt(microsPerCredit) - 1n) / BigInt(microsPerCredit);
    if (credits > BigInt(Number.MAX_SAFE_INTEGER)) fail("ECONOMICS_OVERFLOW");
    operations[operation] = {
      samples: values.length,
      failedSamples: values.filter(s => s.outcome === "failed").length,
      p95ObservedMicros: p95,
      maximumObservedMicros: values.at(-1).total,
      observedFloorCredits: Math.max(
        1,
        Number((observedFloor + BigInt(microsPerCredit) - 1n) / BigInt(microsPerCredit))
      ),
      recommendedCredits: enforced === undefined ? null : Math.max(1, Number(credits)),
      status:
        enforced === undefined
          ? "NEEDS_ENFORCED_CEILING"
          : "REVIEW_SAMPLE_COVERAGE_AND_ENFORCED_CEILING",
    };
  }
  return {
    operations,
    commerciallyApproved: false,
    recommendation:
      "Measured samples inform review; enforce worst-case worker ceilings and include failure/retry cost. No automatic production policy changes.",
  };
}
module.exports = { COMPONENTS, analyseCostEvidence };
