const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');
// Ensure environment variables are set before importing the route (it validates env during import)
process.env.TIKTOK_SANDBOX_CLIENT_KEY = process.env.TIKTOK_SANDBOX_CLIENT_KEY || 'dummy-key';
process.env.TIKTOK_SANDBOX_CLIENT_SECRET = process.env.TIKTOK_SANDBOX_CLIENT_SECRET || 'dummy-secret';
process.env.TIKTOK_SANDBOX_REDIRECT_URI = process.env.TIKTOK_SANDBOX_REDIRECT_URI || 'https://example.com/api/tiktok/auth/callback';
process.env.DEBUG_TIKTOK_OAUTH = 'true';
// Bypass Firebase Admin and stub token verification so getUidFromAuthHeader accepts the test token
process.env.FIREBASE_ADMIN_BYPASS = '1';
const firebaseAdmin = require('../../firebaseAdmin');
firebaseAdmin.admin.auth = () => ({ verifyIdToken: async (token) => ({ uid: 'testUser123' }) });
// Ensure our stub supports nested .collection() calls used by the route
const stubCollection = (name) => ({
  doc: (id) => ({
    collection: (sub) => ({ doc: (subId) => ({ set: async () => true, get: async () => ({ exists: false, data: () => ({}) }) }) }),
    set: async () => true,
    get: async () => ({ exists: false, data: () => ({}) })
  })
});
firebaseAdmin.db.collection = stubCollection;
// Provide a minimal FieldValue.Timestamp stub for serverTimestamp used in routes
firebaseAdmin.admin.firestore.FieldValue = {
  serverTimestamp: () => new Date()
};
// Also stub Timestamp.fromDate if any code referencing it in tests
firebaseAdmin.admin.firestore.Timestamp = {
  fromDate: (d) => d instanceof Date ? d : new Date(d)
};
const app = express();
app.use(bodyParser.json());
app.use('/api/tiktok', require('../tiktokRoutes'));

describe('tiktokRoutes', () => {
  test('GET auth page returns HTML and 200', async () => {
    const res = await request(app)
      .get('/api/tiktok/auth')
      .set('Authorization', 'Bearer test-token-for-testUser123');
    if (res.status !== 200) { console.log('tiktok auth res:', res.status, res.body || res.text); }
    expect(res.status).toBe(200);
    // Should return HTML (simple sanity check)
    expect(res.text && res.text.indexOf('<!doctype') !== -1).toBeTruthy();
  });

  test('status returns connected false when no connection present', async () => {
    const res = await request(app)
      .get('/api/tiktok/status')
      .set('Authorization', 'Bearer test-token-for-testUser123');
    if (res.status !== 200) { console.log('tiktok status res:', res.status, res.body || res.text); }
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });
});
