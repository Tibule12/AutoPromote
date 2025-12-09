const request = require('supertest');
const app = require('../src/server');

describe('PayPal subscription routes', () => {
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_BYPASS = '1';
  });

  test('GET /api/paypal-subscriptions/plans returns plans', async () => {
    const res = await request(app).get('/api/paypal-subscriptions/plans').set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/paypal-subscriptions/create-subscription with free plan returns 400', async () => {
    const res = await request(app)
      .post('/api/paypal-subscriptions/create-subscription')
      .send({ planId: 'free', returnUrl: 'https://example.com/ok', cancelUrl: 'https://example.com/cancel' });
    expect([400,401]).toContain(res.statusCode); // either unauthorized or invalid plan if authenticated
  });
});
