const express = require('express');
const request = require('supertest');
const app = express();
app.use(express.json());
app.use('/api/platform', require('../src/routes/platformRoutes'));

async function simConnect(platform, meta) {
  await request(app)
    .post(`/api/platform/${platform}/auth/simulate`)
    .set('Authorization', 'Bearer test-token-for-testUser123')
    .send({ meta })
    .expect(200);
}

describe('pinterest create board (simulate)', () => {
  beforeAll(async () => {
    await simConnect('pinterest', { display_name: 'PUser', boards: [] });
  });

  test('creates board and metadata includes board', async () => {
    const res = await request(app)
      .post('/api/platform/pinterest/boards')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ name: 'My Test Board', description: 'Created by test' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.board).toBeDefined();

    const metaRes = await request(app)
      .get('/api/platform/pinterest/metadata')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect(200);
    expect(metaRes.body.meta).toBeDefined();
    expect(Array.isArray(metaRes.body.meta.boards)).toBe(true);
    expect(metaRes.body.meta.boards.length).toBeGreaterThan(0);
  });
});
