const express = require('express');
const request = require('supertest');
const bodyParser = require('body-parser');
// Disable viral optimization for this test to avoid writing complex objects to Firestore
process.env.NO_VIRAL_OPTIMIZATION = 'true';
const app = express();
app.use(bodyParser.json());
app.use('/api/content', require('../src/contentRoutes'));

describe('Content upload platform options forwarding', () => {
  it('forwards platform_options payloads to per-platform tasks', async () => {
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
    expect(Array.isArray(body.platform_tasks)).toBe(true);
    const discordTask = body.platform_tasks.find(t => t.platform === 'discord');
    expect(discordTask).toBeDefined();
    expect(discordTask.task.payload.platformOptions.channelId).toBe('chan123');
    const spotifyTask = body.platform_tasks.find(t => t.platform === 'spotify');
    expect(spotifyTask).toBeDefined();
    expect(spotifyTask.task.payload.platformOptions.name).toBe('My Playlist For Test');
    const pinterestTask = body.platform_tasks.find(t => t.platform === 'pinterest');
    expect(pinterestTask).toBeDefined();
    expect(pinterestTask.task.payload.platformOptions.boardId).toBe('b-1234-abcdef');
  }, 20000);
});