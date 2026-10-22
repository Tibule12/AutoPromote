const { computeNextAnalyticsCheck } = require('../src/services/platformMetricsSchedule');

test('quiet first-day posts retain the later observation windows', () => {
  const published = Date.parse('2026-10-21T12:00:00Z');
  expect(computeNextAnalyticsCheck(published, published + 24 * 3600000, { views: 0 }))
    .toBe('2026-10-23T12:00:00.000Z');
  expect(computeNextAnalyticsCheck(published, published + 48 * 3600000, { views: 3 }))
    .toBe('2026-10-24T12:00:00.000Z');
});

test('observation remains bounded to seven days and rejects invalid clocks', () => {
  expect(computeNextAnalyticsCheck(0, 7 * 24 * 3600000)).toBeNull();
  expect(computeNextAnalyticsCheck(NaN, Date.now())).toBeNull();
  expect(computeNextAnalyticsCheck(Date.now(), null)).toBeNull();
});
