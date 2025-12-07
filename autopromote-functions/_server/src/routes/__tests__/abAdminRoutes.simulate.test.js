const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');
// Bypass Firebase Admin initialization in tests
process.env.FIREBASE_ADMIN_BYPASS = '1';
const firebaseAdmin = require('../../firebaseAdmin');
firebaseAdmin.admin.auth = () => ({ verifyIdToken: async (token) => ({ uid: 'test-admin' }) });
// Stub collection for ab_tests
firebaseAdmin.db.collection = (name) => ({
  doc: (id) => ({
    get: async () => ({ exists: true, data: () => ({
      id,
      contentId: 'content-1',
      autopilot: { enabled: true, confidenceThreshold: 10, minSample: 1 },
      variants: [
        { id: 'A', metrics: { views: 100, conversions: 10, revenue: 50 }, promotionSettings: { budget: 100 } },
        { id: 'B', metrics: { views: 120, conversions: 8, revenue: 40 }, promotionSettings: { budget: 100 } }
      ],
      autopilotActions: []
    }) })
  })
});
firebaseAdmin.admin.firestore.FieldValue = { serverTimestamp: () => new Date() };
const app = express();
app.use(bodyParser.json());
app.use('/api/admin/ab_tests', require('../abAdminRoutes'));

describe('abAdminRoutes simulate', () => {
  test('simulate endpoint returns deterministic simulation and budget simulation', async () => {
    const res = await request(app)
      .post('/api/admin/ab_tests/test1/autopilot/simulate')
      .set('Authorization', 'Bearer test-token-for-adminUser')
      .send({ samples: 200, seed: 123, budgetPct: 10 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.simulation).toBeDefined();
    expect(Array.isArray(res.body.simulation.samples)).toBe(true);
    expect(res.body.simulation.samples.length).toBeGreaterThan(0);
    expect(res.body.budgetSimulation).toBeDefined();
    expect(res.body.budgetSimulation.pct).toBe(10);
  });
});
