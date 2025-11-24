const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/platform', require('../src/routes/platformRoutes'));

// Ensure the Pinterest callback route is handled by the Pinterest-specific handler
// and not the generic placeholder.
(async () => {
  try {
    const res = await request(app)
      .get('/api/platform/pinterest/auth/callback?code=abc&state=test')
      .expect('Content-Type', /plain|json|text/) // may be plain text or JSON depending on handler
      .expect(200);

    const bodyText = typeof res.text === 'string' ? res.text : JSON.stringify(res.body || '');
    if (bodyText && bodyText.includes('Callback placeholder')) {
      console.error('ERROR: Callback placeholder was returned instead of Pinterest handler');
      process.exit(1);
    }

    console.log('OK - pinterest auth callback is not intercepted by placeholder');
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
