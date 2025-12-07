const express = require('express');
const request = require('supertest');

describe('Platform metadata basic', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use('/api/platform', require('../src/routes/platformRoutes'));
  });

  it('spotify metadata returns JSON ok', async () => {
    const res = await request(app)
      .get('/api/platform/spotify/metadata')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(res.body).toBeDefined();
    expect(typeof res.body.ok).toBe('boolean');
  });
});
