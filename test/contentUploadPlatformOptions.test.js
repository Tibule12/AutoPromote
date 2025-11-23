const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');
// Disable viral optimization for this test to avoid writing complex objects to Firestore
process.env.NO_VIRAL_OPTIMIZATION = 'true';
const app = express();
app.use(bodyParser.json());
app.use('/api/content', require('../src/contentRoutes'));

(async () => {
  try {
    const payload = {
      title: 'Test upload',
      type: 'video',
      url: 'preview://file.mp4',
      target_platforms: ['discord', 'spotify', 'pinterest'],
      platform_options: {
        discord: { channelId: 'chan123', guildId: 'guild123' },
        spotify: { name: 'My Playlist For Test' },
        pinterest: { boardId: 'b-1234-abcdef' }
      }
    };
    const res = await request(app)
      .post('/api/content/upload')
      .set('Authorization', 'Bearer test-token-for-testUser123')
      .send(payload)
      .expect(201);
    const body = res.body || {};
    if (!Array.isArray(body.platform_tasks)) { console.error('Missing platform_tasks in response', body); process.exit(1); }
    const discordTask = body.platform_tasks.find(t => t.platform === 'discord');
    if (!discordTask || !discordTask.task || !discordTask.task.payload || !discordTask.task.payload.platformOptions) { console.error('Discord task payload missing platformOptions', discordTask); process.exit(1); }
    if (discordTask.task.payload.platformOptions.channelId !== 'chan123') { console.error('Discord channelId mismatch', discordTask.task.payload.platformOptions); process.exit(1); }
    const spotifyTask = body.platform_tasks.find(t => t.platform === 'spotify');
    if (!spotifyTask || !spotifyTask.task || spotifyTask.task.payload.platformOptions.name !== 'My Playlist For Test') { console.error('Spotify playlist name missing or mismatch', spotifyTask); process.exit(1); }
    const pinterestTask = body.platform_tasks.find(t => t.platform === 'pinterest');
    if (!pinterestTask || !pinterestTask.task || pinterestTask.task.payload.platformOptions.boardId !== 'b-1234-abcdef') { console.error('Pinterest boardId missing or mismatch', pinterestTask); process.exit(1); }
    console.log('Content upload platform_options forwarding OK');
    process.exit(0);
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();