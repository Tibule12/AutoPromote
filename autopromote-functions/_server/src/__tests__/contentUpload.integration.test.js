// Integration test for /api/content/upload
// Requires: jest, supertest, and your Express app

const request = require('supertest');
const app = require('../server');
let server;
let agent;

// Optional: Clean up Firestore and timers after tests to avoid Jest teardown errors
const { db } = require('../firebaseAdmin');

describe('Content Upload & Promotion Integration', () => {

  beforeAll((done) => {
    server = app.listen(0, () => {
      agent = request.agent(server);
      done();
    });
  }, 30000); // Increase beforeAll timeout to 30s

  afterAll(async () => {
    try {
      if (db && db.terminate) {
        console.log('Terminating Firestore...');
        await db.terminate();
        console.log('Firestore terminated.');
      }
    } catch (e) {
      console.error('Error terminating Firestore:', e);
    }
    jest.clearAllTimers();
    if (server && server.close) {
      console.log('Closing Express server...');
      await new Promise((resolve) => server.close(resolve));
      console.log('Express server closed.');
    }
  }, 30000); // Increase afterAll timeout to 30s

  it('should upload content and create promotion schedules for all platforms', async () => {
    const testUserId = 'testUser123';
    const payload = {
      title: 'Test Content',
      type: 'video',
      url: 'https://example.com/video.mp4',
      description: 'This is a test video.',
      target_platforms: ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'],
      scheduled_promotion_time: new Date(Date.now() + 3600000).toISOString(),
      promotion_frequency: 'once',
      schedule_hint: { when: new Date(Date.now() + 3600000).toISOString(), frequency: 'once', timezone: 'UTC' },
      auto_promote: { youtube: { enabled: true }, twitter: { enabled: true } },
      quality_score: 95,
      quality_feedback: [],
      quality_enhanced: true
    };

    console.log('Starting POST /api/content/upload integration test...');
    let res;
    try {
      res = await agent
        .post('/api/content/upload')
        .set('Authorization', `Bearer test-token-for-${testUserId}`)
        .send(payload);
      console.log('POST /api/content/upload response:', res.statusCode, res.body);
    } catch (err) {
      console.error('Error during POST /api/content/upload:', err);
      throw err;
    }

    expect(res.statusCode).toBe(201);
    expect(res.body.content).toBeDefined();
    expect(res.body.promotion_schedule).toBeDefined();
    expect(res.body.content.target_platforms.length).toBeGreaterThanOrEqual(5);
    expect(res.body.promotion_schedule.schedule_type).toBe('specific');
    expect(res.body.content.status).toBe('pending');
    expect(res.body.growth_guarantee_badge).toBeDefined();
    expect(res.body.auto_promotion).toBeDefined();
    // Add more assertions for notifications, tracking, etc. as needed
  }, 30000); // Set timeout to 30 seconds
});
