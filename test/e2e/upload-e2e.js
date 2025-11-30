const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');
const { db } = require('../../src/firebaseAdmin');

async function startServer() {
  // Start the main app server (as originally built) - allow all CORS for E2E tests
  process.env.CORS_ALLOW_ALL = 'true';
  const app = require('../../src/server');
  const mainServer = app.listen(0);
  await new Promise((r) => mainServer.once('listening', r));
  const mainPort = mainServer.address().port;
  console.log('Main server started on port', mainPort);

  // Start a small express instance to serve test fixtures (prevents SPA index.html from getting served in place)
  const fixturesApp = express();
  const fixturesPath = path.join(__dirname, 'fixtures');
  fixturesApp.use(express.static(fixturesPath));
  fixturesApp.use(express.json());
  // Allow CORS on the fixture server itself and respond to preflight. The fixture server will also proxy API calls to the main server.
  fixturesApp.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  // Proxy local API calls to the main server to avoid cross-origin requests & CORS preflight
  fixturesApp.all('/api/*', async (req, res) => {
    try {
      const apiUrl = `http://127.0.0.1:${mainPort}${req.originalUrl}`;
      const headers = { ...req.headers, host: `127.0.0.1:${mainPort}` };
      // Ensure we don't forward the requesting origin to the main server to avoid CORS checks
      // Do not forward the request-origin. Removing `origin` header makes it look like a server-side request
      // which CORS middleware will allow since it treats no-origin requests as allowed.
      delete headers.origin;
      const opts = { method: req.method, headers };
      if (req.method !== 'GET' && typeof req.body !== 'undefined') {
        opts.body = JSON.stringify(req.body);
        opts.headers['content-type'] = 'application/json';
      }
      const fetchRes = await fetch(apiUrl, opts);
      const text = await fetchRes.text();
      res.status(fetchRes.status).set(Object.fromEntries(fetchRes.headers.entries())).send(text);
    } catch (e) {
      console.error('Fixture proxy error:', e && e.message);
      res.status(500).send({ error: e && e.message });
    }
  });
  // Serve a small helper route to publish the main port for client-side scripts
  fixturesApp.get('/__e2e/apiBaseUrl', (req, res) => res.json({ apiBaseUrl: `http://127.0.0.1:${mainPort}` }));
  const fixtureServer = fixturesApp.listen(0);
  await new Promise((r) => fixtureServer.once('listening', r));
  const fixturePort = fixtureServer.address().port;
  console.log('Fixture server started on port', fixturePort);

  return { mainServer, fixtureServer, app, mainPort, fixturePort };
}

async function runE2E() {
  console.log('Starting E2E upload test...');
    const { mainServer, fixtureServer, mainPort, fixturePort } = await startServer();
    const pageUrl = `http://127.0.0.1:${fixturePort}/upload_test_page.html`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#title');
    const testTitle = 'E2E Test Content ' + Date.now();
    await page.evaluate((t) => { document.getElementById('title').value = t; }, testTitle);
    await page.evaluate(() => { document.getElementById('description').value = 'E2E test description'; });
    await page.evaluate(() => { document.getElementById('type').value = 'video'; });
    await page.evaluate(() => { document.getElementById('url').value = 'https://example.com/test-e2e.mp4'; });
    // check spotify so we also test platform options pipeline
    await page.evaluate(() => { document.getElementById('target_spotify').checked = true; });
    // trigger submission
    await page.click('#submit');
    // wait for the response to be rendered into #res
    await page.waitForSelector('#res');
    const text = await page.$eval('#res', el => el.textContent);
    const parsed = JSON.parse(text);
    console.log('E2E page response status:', parsed.status);
    if (parsed.status !== 201) {
      throw new Error('Upload did not return success status 201; got: ' + parsed.status);
    }
    // Verify the content doc exists in Firestore
    const contentId = parsed.body && parsed.body.content && parsed.body.content.id;
    if (!contentId) {
      throw new Error('No content ID returned from upload');
    }
    console.log('Uploaded content ID:', contentId);
    const snapRef = db.collection('content').doc(contentId);
    const snap = await snapRef.get();
    if (!snap.exists) {
      throw new Error('Content doc not found in Firestore: ' + contentId);
    }
    const data = snap.data();
    console.log('Firestore content doc exists. Title:', data.title);
    if (!data.target_platforms || !data.target_platforms.includes('spotify')) {
      throw new Error('Spotify not set as target on the content');
    }
    console.log('E2E upload test succeeded.');
    // cleanup: remove the created doc to keep test environment consistent
    try {
      await snapRef.delete();
      console.log('Cleaned up Firestore content doc:', contentId);
    } catch (e) {
      console.warn('Failed to cleanup content doc. You may need to remove it manually:', e && e.message);
    }
  } catch (err) {
    // Dump page HTML for debugging
    try {
      const debugHtml = await page.content();
      console.error('E2E Debug: page content snapshot:\n', debugHtml.slice(0, 8000));
    } catch (ex) {
      console.error('E2E Debug: failed to capture page.content():', ex && ex.message);
    }
    throw err;
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => mainServer ? mainServer.close((err) => err ? reject(err) : resolve()) : resolve());
    await new Promise((resolve, reject) => fixtureServer ? fixtureServer.close((err) => err ? reject(err) : resolve()) : resolve());
  }
}

runE2E().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
