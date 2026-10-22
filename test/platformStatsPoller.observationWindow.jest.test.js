const mockDelete = Symbol('delete field');
let mockRows;
const mockRef = row => ({ set: async update => {
  for (const [key, value] of Object.entries(update)) {
    if (value === mockDelete) delete row[key]; else row[key] = value;
  }
} });
jest.mock('../src/firebaseAdmin', () => ({
  admin: { firestore: { FieldValue: { delete: () => mockDelete, serverTimestamp: () => new Date().toISOString() } } },
  db: { collection: () => {
    const filters = [];
    const query = {
      where: (field, op, value) => { filters.push([field, op, value]); return query; },
      orderBy: () => query, limit: () => query,
      get: async () => {
        const selected = mockRows.filter(row => filters.every(([field, op, value]) =>
          Object.prototype.hasOwnProperty.call(row, field) && (op === '==' ? row[field] === value : row[field] <= value)));
        return { empty: !selected.length, docs: selected.map(row => ({ id: row.id, data: () => row, ref: mockRef(row) })) };
      },
    };
    return query;
  } },
}));
jest.mock('../src/services/platformMetricsService', () => ({}));
jest.mock('../src/services/aggregationService', () => ({}));
jest.mock('../src/services/logger', () => ({}));
jest.mock('../src/services/promotionTaskQueue', () => ({}));
jest.mock('../src/services/variantStatsService', () => ({}));
jest.mock('../src/services/clipOutcomeLearningService', () => ({}));

test('ended observations leave the eligible query while a new quiet post receives its first check', async () => {
  mockRows = [
    { id: 'old', success: true, publishedAt: new Date(Date.now() - 8 * 86400000).toISOString(), next_check_at: null },
    { id: 'new', success: true, publishedAt: new Date().toISOString(), next_check_at: null, metrics: null },
  ];
  const { pollPlatformPostMetricsBatch } = require('../src/services/platformStatsPoller');
  await pollPlatformPostMetricsBatch({ batchSize: 1 });
  expect(mockRows[0].next_check_at).toBeUndefined();
  expect(mockRows[0].metricsObservationEndedAt).toBeTruthy();
  expect(Date.parse(mockRows[1].next_check_at)).toBeGreaterThan(Date.now());
  const endedAt = mockRows[0].metricsObservationEndedAt;
  await pollPlatformPostMetricsBatch({ batchSize: 1 });
  expect(mockRows[0].metricsObservationEndedAt).toBe(endedAt);
});
