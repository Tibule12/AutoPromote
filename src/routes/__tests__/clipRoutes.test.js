const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');

// Use test-token bypass in auth middleware
process.env.FIREBASE_ADMIN_BYPASS = '1';
const firebaseAdmin = require('../../../firebaseAdmin');
// Also stub the functions emulator's server-side firebaseAdmin used by clipRoutes
const serverFirebaseAdmin = require('../../../autopromote-functions/_server/src/firebaseAdmin');



// Simple collection/doc stub helper
const makeDoc = (data) => ({ exists: true, data: () => data, update: async () => true });

describe('clipRoutes', () => {
  beforeEach(() => {
    // Default db.collection stub; tests will override specific collection() usages
    firebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => true,
        update: async () => true
      })
    });
    // Also stub server-side firebase admin used by /autopromote-functions/_server routes
    serverFirebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => true
      })
    });
  });


  test('POST /api/clips/analyze succeeds when content owner matches token (user_id schema)', async () => {
    // Arrange: stub content doc to have snake_case user_id on the default firebaseAdmin used by root routes
    firebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({ get: async () => makeDoc({ user_id: 'testUser123' }), update: async () => true })
    });

    // Stub analyzeVideo to avoid heavy work
    const videoClippingService = require('../../services/videoClippingService');
    videoClippingService.analyzeVideo = async () => ({ analysisId: 'analysis123', clipsGenerated: 2 });

    // Mount app after stubbing to ensure route resolves the stubbed db
    const app = express();
    app.use(bodyParser.json());
    app.use('/api/clips', require('../../routes/clipRoutes'));

    const res = await request(app)
      .post('/api/clips/analyze')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ contentId: 'content123', videoUrl: 'https://storage.googleapis.com/bucket/video.mp4' });

    // Debug on unexpected response
    if (res.status !== 200) {
      console.error('[TEST DEBUG] analyze res body:', JSON.stringify(res.body), 'text:', res.text);
    }
    console.error('[TEST DEBUG] headers sent:', res.request && res.request.header);

    expect(res.status).toBe(200);
    expect(res.body.analysisId).toBe('analysis123');
    expect(res.body.clipsGenerated).toBe(2);
  });

  test('POST /api/clips/analyze returns 403 when content owned by another user', async () => {
    // Stub content owner to a different user on the default firebaseAdmin used by root routes
    firebaseAdmin.db.collection = (name) => ({
      doc: (id) => ({ get: async () => makeDoc({ user_id: 'otherUser' }), update: async () => true })
    });

    // Mount app after stubbing to ensure route resolves the stubbed db
    const app = express();
    app.use(bodyParser.json());
    app.use('/api/clips', require('../../routes/clipRoutes'));

    const res = await request(app)
      .post('/api/clips/analyze')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ contentId: 'content123', videoUrl: 'https://storage.googleapis.com/bucket/video.mp4' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Unauthorized');
  });
});
