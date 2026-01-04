const { planVariants } = require("../services/memeticPlanner");

describe("memeticPlanner", () => {
  test("returns ranked variants and includes simulation and model score", () => {
    const base = { hookStrength: 0.6, shareability: 0.05, predictedWT: 0.6 };
    const plan = planVariants(base, { count: 6, simulationSteps: 6, seedSize: 100 });
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBe(6);
    // top element should have numeric combined score and sim
    expect(typeof plan[0].combined).toBe("number");
    expect(plan[0].sim).toBeDefined();
    expect(plan[0].modelScore).toBeDefined();
  });
});
