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

(async () => {
  try {
    console.log('Testing Pinterest create board (simulated)...');
    await simConnect('pinterest', { display_name: 'PUser', boards: [] });
    // Create a board via the new endpoint
    const res = await request(app)
      .post('/api/platform/pinterest/boards')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ name: 'My Test Board', description: 'Created by test' })
      .expect(200);
    if (!res.body.ok || !res.body.board) { console.error('Create board failed', res.body); process.exit(1); }
    console.log('Create board returned OK');
    // Verify metadata now includes the board
    const metaRes = await request(app)
      .get('/api/platform/pinterest/metadata')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect(200);
    if (!metaRes.body.meta || !Array.isArray(metaRes.body.meta.boards) || metaRes.body.meta.boards.length === 0) {
      console.error('Pinterest boards not present in metadata', metaRes.body);
      process.exit(1);
    }
    console.log('Pinterest metadata includes created board OK');
    process.exit(0);
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
