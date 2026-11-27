const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculate } = require("../../src/services/processingTokens/economics");
const input = require("../../config/free-first-economics.example.json");
test("reproducible 30 scenarios include fixed costs, all-free subsidy and full exposure", () => {
  const m = calculate(input);
  assert.equal(m.scenarios.length, 30);
  for (const row of m.scenarios) {
    assert.equal(row.paidUsers + row.freeUsers, row.users);
    assert.ok(row.maximum.totalInfrastructureMicros >= row.average.totalInfrastructureMicros);
    assert.equal(
      row.maximum.worstCaseExposureMicros,
      row.maximum.totalInfrastructureMicros + row.paymentFeesMicros
    );
    if (!row.paidUsers)
      assert.equal(row.average.requiredSubsidyMicros, row.average.totalInfrastructureMicros);
  }
  assert.equal(m.scenarios[0].average.freeUserMicros, 80000);
});
test("financial inputs reject missing costs, non-USD, nonzero ad revenue and average above maximum", () => {
  assert.throws(() => calculate({ ...input, currency: "ZAR" }));
  assert.throws(() => calculate({ ...input, advertisingRevenueMicros: 1 }));
  assert.throws(() =>
    calculate({ ...input, free: { ...input.free, averageProcessingMicros: 500001 } })
  );
});
test('31-day calendar stress includes an extra renewal window without assuming extra subscription revenue', () => {
  const r=calculate(input).scenarios.find(r=>r.users===1000000&&r.conversion===0);
  assert.equal(r.calendar31DayStress.extraProcessingMicros,100000000000);
  assert.equal(r.calendar31DayStress.totalInfrastructureMicros,650150000000);
});
