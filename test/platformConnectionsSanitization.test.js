const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/platform', require('../src/routes/platformConnectionsRoutes'));

(async () => {
  try {
    const res = await request(app)
      .get('/api/platform/status')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect('Content-Type', /json/)
      .expect(200);

    const body = res.body || {};
    if (body.raw) {
      // ensure no token fields included in raw
      Object.values(body.raw).forEach((v) => {
        if (v && (v.tokens || v.access_token || v.refresh_token || v.encrypted_access_token || v.encrypted_refresh_token)) {
          console.error('Sanitization failed - token-like fields present in raw:', JSON.stringify(v, null, 2));
          process.exit(1);
        }
      });
    }
    console.log('Platform connections sanitization test passed');
    console.log('OK');
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();