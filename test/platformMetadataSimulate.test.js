const express = require('express');
const request = require('supertest');

describe('Platform metadata simulate endpoints', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/platform', require('../src/routes/platformRoutes'));
  });
  beforeAll(() => { process.env.DEBUG_TEST_LOGS = '1'; });

  async function simAndGet(platform, meta) {
    await request(app)
      .post(`/api/platform/${platform}/auth/simulate`)
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send({ meta })
      .expect(200);
    // Read the stored connection doc directly from the bypass DB for debugging
    const { db } = require('../src/firebaseAdmin');
    try {
      const d = await db.collection('users').doc('testUser123').collection('connections').doc(platform).get();
      if (d.exists) console.log('Stored connection meta for platform', platform, d.data()); else console.log('No stored connection doc for', platform);
    } catch (e) { console.log('Error reading stored connection doc for', platform, e && e.message); }
    const res = await request(app)
      .get(`/api/platform/${platform}/metadata`)
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .expect(200);
    return res.body;
  }

  it('returns Spotify metadata after simulate', async () => {
    const res = await simAndGet('spotify', { display_name: 'SimUser', playlists: [{ id: 'p1', name: 'P1' }] });
    expect(res.meta).toBeDefined();
    expect(Array.isArray(res.meta.playlists)).toBe(true);
  });

  it('returns Discord metadata after simulate', async () => {
    const res = await simAndGet('discord', { display_name: 'DUser', guilds: [{ id: 'g1', name: 'G1' }] });
    expect(res.meta).toBeDefined();
    expect(Array.isArray(res.meta.guilds)).toBe(true);
  });

  it('returns LinkedIn metadata after simulate', async () => {
    const res = await simAndGet('linkedin', { profile: { localizedFirstName: 'L' }, organizations: [{ id: 'o1', name: 'Org' }] });
    expect(res.meta).toBeDefined();
    expect(Array.isArray(res.meta.organizations)).toBe(true);
  });

  it('returns Pinterest metadata after simulate', async () => {
    const res = await simAndGet('pinterest', { display_name: 'PUser', boards: [{ id: 'b1', name: 'Board 1' }] });
    expect(res.meta).toBeDefined();
    expect(Array.isArray(res.meta.boards)).toBe(true);
  });
});