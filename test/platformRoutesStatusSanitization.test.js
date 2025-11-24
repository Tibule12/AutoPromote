const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/platform', require('../src/routes/platformRoutes'));

(async () => {
  try {
    const res = await request(app)
      .get('/api/platform/spotify/status')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect('Content-Type', /json/)
      .expect(200);

    const body = res.body || {};
    if (body.meta && (body.meta.tokens || body.meta.access_token || body.meta.refresh_token)) {
      console.error('Sanitization failed - meta contains token fields');
      process.exit(1);
    }
    if (body.raw && body.raw.tokens) {
      console.error('Sanitization failed - tokens present in raw');
      process.exit(1);
    }
    console.log('Platform spotify status sanitization test passed');
    console.log('OK');
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();