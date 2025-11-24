const express = require('express');
const request = require('supertest');
const app = express();

// Ensure environment variables for test
process.env.YT_CLIENT_ID = 'TEST_YT_CLIENT_ID';
process.env.YT_CLIENT_SECRET = 'TEST_YT_CLIENT_SECRET';
process.env.YT_REDIRECT_URI = 'https://example.local/api/youtube/callback';

// Monkey-patch safeFetch to return fake token/channel responses
const ssrf = require('../src/utils/ssrfGuard');
ssrf.safeFetch = (url, fetchFn, opts) => {
  if (String(url).includes('oauth2.googleapis.com/token')) {
    return Promise.resolve({ ok: true, json: async () => ({ access_token: 'FAKE_ACCESS', refresh_token: 'FAKE_REFRESH', expires_in: 3600, scope: 'scope' }) });
  }
  if (String(url).includes('www.googleapis.com/youtube/v3/channels')) {
    return Promise.resolve({ ok: true, json: async () => ({ items: [{ id: 'channel-123', snippet: { title: 'Fake Channel' } }] }) });
  }
  return Promise.resolve({ ok: false, json: async () => ({ error: 'unavailable' }) });
};

app.use('/api/youtube', require('../src/routes/youtubeRoutes'));

(async () => {
  try {
    const res = await request(app)
      .get('/api/youtube/callback?code=testcode')
      .expect('Content-Type', /json/)
      .expect(200);

    const body = res.body || {};
    if (body.access_token || body.refresh_token || (body.token && (body.token.access_token || body.token.refresh_token))) {
      console.error('Sanitization failed - tokens present in response');
      console.error('Response body:', JSON.stringify(body));
      process.exit(1);
    }
    console.log('YouTube callback sanitization test passed');
    console.log('OK');
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();