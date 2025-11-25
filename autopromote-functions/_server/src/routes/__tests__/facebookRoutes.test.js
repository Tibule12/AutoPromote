const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');
process.env.FB_CLIENT_ID = process.env.FB_CLIENT_ID || 'dummyfb';
process.env.FB_CLIENT_SECRET = process.env.FB_CLIENT_SECRET || 'dummysecret';
process.env.FB_REDIRECT_URI = process.env.FB_REDIRECT_URI || 'https://example.com/api/facebook/callback';
process.env.FIREBASE_ADMIN_BYPASS = '1';
const firebaseAdmin = require('../../firebaseAdmin');
firebaseAdmin.admin.auth = () => ({ verifyIdToken: async (token) => ({ uid: 'testUser123' }) });
const app = express();
app.use(bodyParser.json());
app.use('/api/facebook', require('../facebookRoutes'));

describe('facebookRoutes', () => {
  test('requirements and health endpoints return info', async () => {
    const res = await request(app)
      .get('/api/facebook/requirements')
      .expect(200);
    expect(res.body.requestedScopes).toBeTruthy();
    const health = await request(app).get('/api/facebook/health').expect(200);
    expect(health.body).toHaveProperty('ok');
  });

  test('status returns connected false when not connected', async () => {
    const res = await request(app)
      .get('/api/facebook/status')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect(200);
    expect(res.body.connected).toBe(false);
  });
});
