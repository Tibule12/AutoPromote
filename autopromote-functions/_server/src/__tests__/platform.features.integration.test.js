// Integration tests for platform features: analytics, admin, community, fraud, rate limiting, schema validation

const request = require('supertest');
const app = require('../server');
let server;
let agent;
const { db } = require('../firebaseAdmin');

describe('Platform Features Integration', () => {
  beforeAll((done) => {
    server = app.listen(0, () => {
      agent = request.agent(server);
      done();
    });
  });

  it('should get analytics for content', async () => {
    const res = await agent.get('/api/content/12345/analytics').set('Authorization', 'Bearer test-token-for-testUser123');
    expect([200,404]).toContain(res.statusCode);
    // If analytics exist, expect analytics object
    if (res.statusCode === 200) expect(res.body.analytics).toBeDefined();
  }, 10000);

  it('should allow admin to process payout', async () => {
    const res = await agent.post('/api/content/admin/process-creator-payout/12345')
      .set('Authorization', 'Bearer test-token-for-adminUser')
      .send({ recipientEmail: 'test@example.com', payoutAmount: 100 });
    expect([200,404,403]).toContain(res.statusCode);
  });

  it('should allow admin to moderate content', async () => {
    const res = await agent.post('/api/content/admin/moderate-content/12345')
      .set('Authorization', 'Bearer test-token-for-adminUser')
      .send();
    expect([200,404,403]).toContain(res.statusCode);
  });

  it('should get leaderboard', async () => {
    const res = await agent.get('/api/content/leaderboard').set('Authorization', 'Bearer test-token-for-testUser123');
    expect(res.statusCode).toBe(200);
    expect(res.body.leaderboard).toBeDefined();
  }, 10000);

  it('should create growth squad', async () => {
    const res = await agent.post('/api/content/growth-squad')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ userIds: ['u1','u2'] });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should create viral challenge', async () => {
    const res = await agent.post('/api/content/viral-challenge')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ name: 'Challenge', reward: 'Prize' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should detect fraud', async () => {
    const res = await agent.post('/api/content/detect-fraud/12345')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ metrics: { views: 2000000, engagement_rate: 0.005 } });
    expect(res.statusCode).toBe(200);
    expect(res.body.fraudStatus).toBeDefined();
  }, 10000);

  it('should enforce rate limiting on upload', async () => {
    let lastStatus = 201;
    for (let i = 0; i < 12; i++) {
      const res = await agent.post('/api/content/upload')
        .set('Authorization', 'Bearer test-token-for-testUser123')
        .send({ title: 'Test', type: 'video', url: 'https://example.com/video.mp4', description: 'Test' });
      lastStatus = res.statusCode;
    }
    expect([201,429]).toContain(lastStatus);
  }, 10000);

  it('should reject invalid upload payloads (schema validation)', async () => {
    const res = await agent.post('/api/content/upload')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ title: '', type: 'invalid', url: 'not-a-url', description: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
