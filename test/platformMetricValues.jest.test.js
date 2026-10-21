const { numericMetric, normalizeMetrics } = require("../src/services/platformMetricValues");

test("missing, blank, boolean and invalid aliases cannot mask a later real counter", () => {
  expect(numericMetric(null, undefined, "", " ", false, NaN, Infinity, -1, "23")).toBe(23);
  expect(numericMetric(null, false, "")).toBeNull();
  expect(numericMetric(0, 23)).toBe(0);
});

test("unsupported metrics stay null while explicit zeros and distinct impressions survive", () => {
  expect(normalizeMetrics({ view_count: 0, impressions: 123, comment_count: "0" })).toEqual({
    views: 0, impressions: 123, likes: null, comments: 0, shares: null, clicks: null,
  });
  expect(normalizeMetrics(null).views).toBeNull();
});
