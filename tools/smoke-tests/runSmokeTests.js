// Smoke test script for AutoPromote API
// Usage: node runSmokeTests.js
// Environment variables required:
//   API_BASE_URL - base API URL, e.g., https://autopromote.onrender.com
//   AUTH_TOKEN - a Bearer token for an admin/test user (optional; required for auth tests)
// Optional envs:
//   CONTENT_URL - a small public asset URL to include with the content (default: a small PNG)
// Notes: The script will not attempt to post to third-party platforms; it only creates a content and triggers enqueues.

const fetch = global.fetch || require('node-fetch');
const API_BASE = process.env.API_BASE_URL || 'https://autopromote.onrender.com';
const TOKEN = process.env.AUTH_TOKEN || '';
const CONTENT_URL = process.env.CONTENT_URL || 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/320px-Example.jpg';

function log(h, m) { console.log(`[${h}]`, m || ''); }

async function getHealth() {
  const url = `${API_BASE}/api/health`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    log('HEALTH', `${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    return res.ok;
  } catch (e) {
    log('HEALTH', 'ERROR ' + e.message);
    return false;
  }
}

async function listContent() {
  const url = `${API_BASE}/api/content`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    log('LIST CONTENT', `${res.status} count=${json.content ? json.content.length : (Array.isArray(json) ? json.length : 'N/A')}`);
    return json;
  } catch (e) {
    log('LIST CONTENT', 'ERROR ' + e.message);
    return null;
  }
}

async function createContent() {
  if (!TOKEN) { log('CREATE', 'Skipping: AUTH_TOKEN not provided'); return null; }
  const url = `${API_BASE}/api/content/upload`;
  const title = `smoke-test-${Date.now()}`;
  const body = {
    title,
    type: 'image',
    url: CONTENT_URL,
    description: 'Smoke test content - please ignore',
    // no target_platforms to avoid requiring platform options
    auto_promote: false
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    log('CREATE', `${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    return { ok: res.ok, body: json };
  } catch (e) {
    log('CREATE', 'ERROR ' + e.message);
    return null;
  }
}

async function getMyContent() {
  if (!TOKEN) { log('MY CONTENT', 'Skipping: AUTH_TOKEN not provided'); return null; }
  const url = `${API_BASE}/api/content/my-content`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const json = await res.json();
    log('MY CONTENT', `${res.status} content_count=${json.content ? json.content.length : 'N/A'}`);
    return json;
  } catch (e) {
    log('MY CONTENT', 'ERROR ' + e.message);
    return null;
  }
}

async function enqueueYouTubeUpload(contentId) {
  if (!TOKEN) { log('ENQUEUE', 'Skipping: AUTH_TOKEN not provided'); return null; }
  const url = `${API_BASE}/api/promotion-tasks/youtube/enqueue`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ contentId, fileUrl: CONTENT_URL })
    });
    const json = await res.json();
    log('ENQUEUE', `${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    return { ok: res.ok, body: json };
  } catch (e) {
    log('ENQUEUE', 'ERROR ' + e.message);
    return null;
  }
}

async function processOneYouTubeTask() {
  const url = `${API_BASE}/api/promotion-tasks/youtube/process-once`;
  try {
    const res = await fetch(url, { method: 'POST' });
    const json = await res.json();
    log('PROCESS', `${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  } catch (e) {
    log('PROCESS', 'ERROR ' + e.message);
    return null;
  }
}

(async function main(){
  console.log('Running smoke tests against', API_BASE);
  const healthOk = await getHealth();
  if (!healthOk) console.warn('Health check failed — proceed but results likely indicate server problems');

  await listContent();

  let created = null;
  if (TOKEN) {
    created = await createContent();
    if (created && created.ok && created.body && created.body.content && created.body.content.id) {
      const cid = created.body.content.id;
      // my content should include it
      await getMyContent();

      // enqueue a youtube task
      const enq = await enqueueYouTubeUpload(cid);
      if (enq && enq.ok) {
        // try to process a task (this may fail with provider auth errors but should show progress)
        await processOneYouTubeTask();
      }
    }
  } else {
    log('INFO', 'AUTH_TOKEN not set — only unauthenticated tests run (health, list content)');
  }
  console.log('\nSmoke tests complete. Review logs above and check for any 5xx or unexpected errors.');
})();
