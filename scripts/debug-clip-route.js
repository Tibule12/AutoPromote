(async () => {
  try {
    const express = require('express');
    const request = require('supertest');
    const bodyParser = require('body-parser');
    const { db } = require('../firebaseAdmin');

    // Stub db as in non-emulator branch
    const firebaseAdmin = require('../firebaseAdmin');
    firebaseAdmin.db.collection = _name => ({
      doc: _id => ({
        get: async () => ({ exists: true, data: () => ({ user_id: 'testUser123' }) }),
        update: async () => true,
      }),
    });
    try { require('../firebaseAdmin').db.collection = firebaseAdmin.db.collection; } catch (e) {}

    const videoClippingService = require('../src/services/videoClippingService');
    videoClippingService.analyzeVideo = async () => ({ analysisId: 'analysis123', clipsGenerated: 2 });

    const app = express();
    app.use(bodyParser.json());
    delete require.cache[require.resolve('../src/routes/clipRoutes')];
    app.use('/api/clips', require('../src/routes/clipRoutes'));

    const res = await request(app)
      .post('/api/clips/analyze')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ contentId: 'content123', videoUrl: 'https://example.com/video.mp4' });

    console.log('RES', res.status, res.body);
  } catch (e) {
    console.error('ERR', e && e.message, e && e.stack);
  }
})();