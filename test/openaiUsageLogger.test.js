const { db } = require('../src/firebaseAdmin');
const { logOpenAIUsage } = require('../src/services/openaiUsageLogger');

describe('openaiUsageLogger', () => {
  beforeAll(() => {
    process.env.OPENAI_LOGGING_ENABLED = '1';
  });

  test('logs usage to openai_usage collection (in memory db)', async () => {
    const before = await db.collection('openai_usage').get();
    const initialSize = before.size || 0;
    await logOpenAIUsage({ userId: 'test-user', model: 'gpt-4o', feature: 'test-feature', usage: { total_tokens: 10 } });
    const after = await db.collection('openai_usage').get();
    expect(after.size).toBeGreaterThanOrEqual(initialSize + 1);
    // verify data sanity
    const docs = after.docs.map(d => d.data());
    const found = docs.find(d => d.userId === 'test-user' && d.feature === 'test-feature');
    expect(found).toBeTruthy();
    expect(found.usage.total_tokens).toBe(10);
  });
});
