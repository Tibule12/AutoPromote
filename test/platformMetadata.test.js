const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/platform', require('../src/routes/platformRoutes'));

(async () => {
  try {
    const res = await request(app)
      .get('/api/platform/spotify/metadata')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect('Content-Type', /json/)
      .expect(200);

    if (!res.body || typeof res.body.ok === 'undefined') {
      console.error('Unexpected response body', res.body);
      process.exit(1);
    }
    console.log('Platform metadata endpoint responded with:', JSON.stringify(res.body, null, 2));
    console.log('OK');
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
