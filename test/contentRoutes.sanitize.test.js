// Ensure content routes sanitize non-POJOs returned by engines before writing to Firestore
const request = require('supertest');
process.env.FIREBASE_ADMIN_BYPASS = '1';
process.env.OPENAI_LOGGING_ENABLED = '1';

// Mock algorithmExploitationEngine to return a non-plain object
jest.mock('../src/services/algorithmExploitationEngine', () => ({
  optimizeForAlgorithm: jest.fn((content, platform) => ({ optimizationScore: 42, hook: { run: () => 'i am a fn' }, weird: new (function X() { this.ok = true; })() }))
}));

const app = require('../src/server');

describe('contentRoutes sanitization integration', () => {
  test('POST /api/content/upload sanitizes non-POJO optimization object and responds 201 (emulator bypass)', async () => {
    const res = await request(app)
      .post('/api/content/upload')
      .set('Content-Type', 'application/json')
      .send({ title: 'Test', type: 'video', url: 'https://example.com/test.mp4', description: 'desc', target_platforms: ['youtube'], scheduled_promotion_time: new Date().toISOString(), platform_options: {} })
      .set('Authorization', 'Bearer test-token-for-testUser123');
    expect([200,201,201]).toContain(res.statusCode);
    // No 500 due to non-POJO write
    expect(res.body).toBeDefined();
    expect(res.body.content).toBeDefined();
    expect(res.body.content.viral_optimization).toBeDefined();
  }, 15000);
});
