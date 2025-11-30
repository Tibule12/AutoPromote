const { test, expect } = require('@playwright/test');
const path = require('path');
const fetch = require('node-fetch');

test('API upload test - create content and check Firestore', async () => {
  process.env.CORS_ALLOW_ALL = 'true';
  // Prefer a supplied GOOGLE_APPLICATION_CREDENTIALS path; otherwise, if the env provides the service account
  // JSON or base64, write it to test/e2e/tmp/service-account.json and use that.
  const tmpSaPath = path.resolve(__dirname, '..', 'tmp', 'service-account.json');
  const fs = require('fs');
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64) {
        const payload = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || Buffer.from(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        fs.mkdirSync(path.dirname(tmpSaPath), { recursive: true });
        fs.writeFileSync(tmpSaPath, payload, { encoding: 'utf8', mode: 0o600 });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpSaPath;
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not write temporary service account file for API tests:', e.message);
  }
  const { db } = require('../../../src/firebaseAdmin');
  const app = require('../../../src/server');
  const mainServer = app.listen(0);
  await new Promise((r) => mainServer.once('listening', r));
  const mainPort = mainServer.address().port;
  try {
    const payload = {
      title: 'API E2E Test',
      type: 'video',
      url: 'https://example.com/video.mp4',
      description: 'E2E upload via direct API for Playwright runner',
      target_platforms: ['spotify']
    };
    const res = await fetch(`http://127.0.0.1:${mainPort}/api/content/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token-for-testUser123' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    expect(res.status).toBe(201);
    const contentId = json.body?.content?.id;
    expect(contentId).toBeTruthy();
    // cleanup
    // Defer firebaseAdmin require until after we set GOOGLE_APPLICATION_CREDENTIALS
    await db.collection('content').doc(contentId).delete();
  } finally {
    await new Promise((r) => mainServer ? mainServer.close(r) : r());
  }
});
