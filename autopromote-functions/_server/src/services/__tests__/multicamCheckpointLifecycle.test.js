const lifecycleConfig = require("../../../lifecycle.json");

describe("multicam checkpoint lifecycle", () => {
  it("removes abandoned render checkpoints after one day", () => {
    const rules = lifecycleConfig.lifecycle?.rule || [];
    const oneDayDeleteRule = rules.find(
      rule => rule.action?.type === "Delete" && Number(rule.condition?.age) === 1
    );

    expect(oneDayDeleteRule).toBeDefined();
    expect(oneDayDeleteRule.condition.matchesPrefix).toContain(
      "temp/multicam-checkpoints/"
    );
  });
});
