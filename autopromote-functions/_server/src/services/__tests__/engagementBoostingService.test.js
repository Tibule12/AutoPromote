const service = require("../engagementBoostingService");

describe("EngagementBoostingService LinkedIn & Reddit support", () => {
  test("generateViralCaption returns LinkedIn-ready caption and hashtags limit", () => {
    const content = { title: "How to grow your network" };
    const result = service.generateViralCaption(content, "linkedin");

    expect(result).toBeDefined();
    expect(typeof result.caption).toBe("string");
    // LinkedIn hashtag limit is 5
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result.hashtags.length).toBeLessThanOrEqual(5);
  });

  test("generateViralCaption returns Reddit caption and has no hashtags", () => {
    const content = { title: "Why this discussion matters" };
    const result = service.generateViralCaption(content, "reddit");

    expect(result).toBeDefined();
    expect(typeof result.caption).toBe("string");
    // Reddit should not include hashtags by default
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result.hashtags.length).toBe(0);
  });
});
