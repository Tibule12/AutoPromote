const express = require('express');
const request = require('supertest');
const app = express();
app.use(express.json());
app.use('/api/platform', require('../src/routes/platformRoutes'));

async function simAndGet(platform, meta) {
  // Simulate add
  await request(app)
    .post(`/api/platform/${platform}/auth/simulate`)
    .set('Authorization', 'Bearer test-token-for-testUser123')
    .send({ meta })
    .expect(200);
  // Fetch metadata
  const res = await request(app)
    .get(`/api/platform/${platform}/metadata`)
    .set('Authorization', 'Bearer test-token-for-testUser123')
    .expect(200);
  return res.body;
}

(async () => {
  try {
    console.log('Testing Spotify simulate + metadata...');
    const spRes = await simAndGet('spotify', { display_name: 'SimUser', playlists: [{ id: 'p1', name: 'P1' }] });
    if (!spRes.meta || !Array.isArray(spRes.meta.playlists)) { console.error('Spotify metadata not present', spRes); process.exit(1); }
    console.log('Spotify metadata OK');

    console.log('Testing Discord simulate + metadata...');
    const dRes = await simAndGet('discord', { display_name: 'DUser', guilds: [{ id: 'g1', name: 'G1' }] });
    if (!dRes.meta || !Array.isArray(dRes.meta.guilds)) { console.error('Discord metadata not present', dRes); process.exit(1); }
    console.log('Discord metadata OK');

    console.log('Testing LinkedIn simulate + metadata...');
    const lRes = await simAndGet('linkedin', { profile: { localizedFirstName: 'L' }, organizations: [{ id: 'o1', name: 'Org' }] });
    if (!lRes.meta || !Array.isArray(lRes.meta.organizations)) { console.error('LinkedIn metadata not present', lRes); process.exit(1); }
    console.log('LinkedIn metadata OK');

    console.log('Platform metadata simulate tests passed');
    // Test Pinterest simulate & metadata
    console.log('Testing Pinterest simulate + metadata...');
    const pRes = await simAndGet('pinterest', { display_name: 'PUser', boards: [{ id: 'b1', name: 'Board 1' }] });
    if (!pRes.meta || !Array.isArray(pRes.meta.boards)) { console.error('Pinterest metadata not present', pRes); process.exit(1); }
    console.log('Pinterest metadata OK');
    process.exit(0);
  } catch (e) {
    console.error('Test failed:', e.message || e);
    process.exit(1);
  }
})();