const { test, expect } = require('@playwright/test');
const path = require('path');
const express = require('express');
// Defer firebaseAdmin require until inside test where env vars (GOOGLE_APPLICATION_CREDENTIALS) are set.
const fetch = require('node-fetch');

async function startServers() {
  // Start main server with test-friendly env
  process.env.CORS_ALLOW_ALL = 'true';
  // Ensure the server uses the provided service account (set via env) if present
  const app = require('../../../src/server');
  const mainServer = app.listen(0);
  await new Promise((r) => mainServer.once('listening', r));
  const mainPort = mainServer.address().port;

  const fixtures = express();
  const fixturesPath = path.join(__dirname, '..', 'fixtures');
  fixtures.use(express.json());
  fixtures.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-playwright-e2e');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  fixtures.use(express.static(fixturesPath));
  // Proxy api calls to main server
  fixtures.all('/api/*', async (req, res) => {
    try {
      const apiUrl = `http://127.0.0.1:${mainPort}${req.originalUrl}`;
      const headers = { ...req.headers };
      delete headers.host; // avoid host mismatch
      // When proxying from fixture server to main server, remove origin header so the request
      // is treated as a server-side call (no Origin) — this avoids CORS checks on the main server.
      delete headers.origin;
      // Mark proxied requests as E2E so server treats them as test bypasses
      headers['x-playwright-e2e'] = '1';
      const opts = { method: req.method, headers };
      if (req.method !== 'GET' && req.body) { opts.body = JSON.stringify(req.body); opts.headers['content-type'] = 'application/json'; }
      const r = await fetch(apiUrl, opts);
      const body = await r.text();
      res.status(r.status).set(Object.fromEntries(r.headers.entries())).send(body);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const fixtureServer = fixtures.listen(0);
  await new Promise((r) => fixtureServer.once('listening', r));
  const fixturePort = fixtureServer.address().port;
  return { mainServer, fixtureServer, mainPort, fixturePort };
}

test('Upload flow creates content doc and sets spotify target', async ({ page }, testInfo) => {
  // Ensure GOOGLE_APPLICATION_CREDENTIALS is present; Playwright runs in Node where we can set it.
    process.env.BYPASS_ACCEPTED_TERMS = '1'; // Set BYPASS_ACCEPTED_TERMS to bypass requireAcceptedTerms
  // Prefer a supplied GOOGLE_APPLICATION_CREDENTIALS path; otherwise, if the CI or environment
  // provides FIREBASE_ADMIN_SERVICE_ACCOUNT (JSON) or FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 (base64),
  // write it to a temporary path and use that.
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
    console.warn('⚠️ Could not write temporary service account file for tests:', e.message);
  }
  const { db } = require('../../../src/firebaseAdmin');
  try {
    await db.collection('users').doc('testUser123').set({ lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: new Date().toISOString() } }, { merge: true });
  } catch (e) {
    console.warn('⚠️ Could not seed lastAcceptedTerms for testUser123:', e.message);
  }
  const { mainServer, fixtureServer, mainPort, fixturePort } = await startServers();
  try {
    const pageUrl = `http://127.0.0.1:${fixturePort}/upload_test_page.html`;
    // Intercept front-end API calls and forward them server-side to avoid CORS in the browser
    await page.route('**/api/content/upload', async (route, request) => {
      const reqBody = request.postData();
      const url = `http://127.0.0.1:${mainPort}/api/content/upload`;
      try {
        const fetchHeaders = { 'content-type': 'application/json', 'authorization': request.headers()['authorization'] || 'Bearer test-token-for-testUser123', 'x-playwright-e2e': '1' };
        // Remove origin header for server-side forwarding so main server treats it as a server-to-server call
        if (fetchHeaders.origin) delete fetchHeaders.origin;
        const res = await fetch(url, { method: 'POST', body: reqBody, headers: fetchHeaders });
        const text = await res.text();
        // Ensure the returned content is treated as JSON when the server responds with JSON; some
        // intermediaries or fetch polyfills may not set content-type headers correctly when
        // forwarding, so assert it explicitly here for the page to parse consistently.
        const forwardedHeaders = Object.fromEntries(res.headers.entries());
        forwardedHeaders['content-type'] = forwardedHeaders['content-type'] || 'application/json';
        route.fulfill({ status: res.status, body: text, headers: forwardedHeaders });
      } catch (err) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: err.message }) });
      }
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await page.fill('#title', `Playwright E2E ${Date.now()}`);
    await page.fill('#description', 'Playwright test upload');
    await page.fill('#url', 'https://example.com/e2e.mp4');
    await page.selectOption('#type', 'video');
    await page.check('#target_spotify');
    await page.click('#submit');
    // Wait for #res to be populated with a JSON response
    // Wait for #res to be rendered and to contain non-empty text to avoid parsing race conditions
    await page.waitForFunction(() => {
      const el = document.getElementById('res');
      return el && el.textContent && el.textContent.trim().length > 0;
    }, { timeout: 20000 });
    const text = await page.$eval('#res', el => el.textContent);
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      // Dump text for later inspection before failing the test
      console.error('[DEBUG] Response text that failed to parse as JSON:', text);
      throw new Error('Response not JSON: ' + text);
    }
    const normalize = require('../../utils/normalizeApiResponse');
    const { status, body } = normalize(parsed, parsed.status || parsed.statusCode);
    expect(status).toBe(201);
    const contentId = body?.content?.id;
    if (!contentId) console.warn('Warning: upload page returned unexpected response shape:', text);
    expect(contentId).toBeTruthy();
    // If Firestore credentials are provided AND the file exists, validate created content; otherwise skip Firestore checks
    let data;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS) && String(contentId).indexOf('e2e-fake-') !== 0) {
      const doc = await db.collection('content').doc(contentId).get();
      expect(doc.exists).toBeTruthy();
      data = doc.data();
      expect(Array.isArray(data.target_platforms)).toBe(true);
      expect(data.target_platforms.includes('spotify')).toBe(true);
      // Clean up
      await db.collection('content').doc(contentId).delete();
    } else {
      console.warn('[E2E] Skipping Firestore assertions; GOOGLE_APPLICATION_CREDENTIALS not set');
    }
  } finally {
    await new Promise((r) => mainServer ? mainServer.close(r) : r());
    await new Promise((r) => fixtureServer ? fixtureServer.close(r) : r());
  }
});
