const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');

// Use test-token bypass in auth middleware
process.env.FIREBASE_ADMIN_BYPASS = '1';
const firebaseAdmin = require('../../../firebaseAdmin');

describe('generate-and-publish', () => {
  beforeEach(() => {
    // Default db.collection stub; tests will override specific collection() usages
    firebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => true,
        update: async () => true
      })
    });
  });

  test('enqueue and then poll status', async () => {
    // Stub content doc to have owner userId
    firebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({ get: async () => ({ exists: true, data: () => ({ userId: 'testUser', videoUrl: 'https://storage/video.mp4' }) }) })
    });
    // Also stub the src-level firebaseAdmin (used by routes required from src/)
    try {
      const srcFb = require('../../firebaseAdmin');
      srcFb.db.collection = firebaseAdmin.db.collection;
    } catch (e) { /* best-effort */ }

    // Stub analyze and generate to avoid heavy work
    const videoClippingService = require('../../services/videoClippingService');
    videoClippingService.analyzeVideo = async (videoUrl, contentId, userId) => ({ analysisId: 'a1', topClips: [{ id: 'c1' }], clipsGenerated: 1 });
    videoClippingService.generateClip = async (analysisId, clipId, options) => ({ success: true, clipUrl: 'https://storage/clip.mp4' });

    // Verify stub works as expected
    const docCheck = await firebaseAdmin.db.collection('content').doc('content123').get();
    // Mount app after stubbing to ensure route resolves the stubbed db
    const app = express();
    app.use(bodyParser.json());
    // Ensure fresh module load so the route captures our stubbed `db`
    delete require.cache[require.resolve('../../routes/clipRoutes')];
    app.use('/api/clips', require('../../routes/clipRoutes'));

    const res = await request(app)
      .post('/api/clips/generate-and-publish')
      .set('Authorization', 'Bearer test-token-for-testUser')
      .send({ contentId: 'content123', options: {} });

    // No debug logging in normal test runs
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeTruthy();

    const jobId = res.body.jobId;
    // Give worker time to complete (in-memory worker runs async)
    await new Promise(r => setTimeout(r, 2000));

    const stat = await request(app).get(`/api/clips/generate-status/${jobId}`).set('Authorization', 'Bearer test-token-for-testUser');
    expect(stat.status).toBe(200);
    expect(stat.body.job.status).toBe('complete');
    expect(stat.body.job.clipResult.clipUrl).toBeDefined();
  });
});
