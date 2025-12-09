const fetch = global.fetch || require('node-fetch');
const API_BASE = process.env.API_BASE_URL || 'https://autopromote.onrender.com';
const fs = require('fs');
const token = fs.readFileSync('tools/smoke-tests/.idtoken', 'utf8').trim();
const CONTENT_URL = process.env.CONTENT_URL || 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/320px-Example.jpg';

(async function(){
  const url = `${API_BASE}/api/content/upload`;
  const title = `debug-smoke-${Date.now()}`;
  const body = {
    title,
    type: 'image',
    url: CONTENT_URL,
    description: 'Debugging smoke test content - show raw response',
    auto_promote: {}
  };
  try {
    const bypassHeader = process.env.BYPASS_VIRAL === '1' || process.env.BYPASS_VIRAL === 'true';
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (bypassHeader) headers['x-bypass-viral'] = '1';
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log('[DEBUG CREATE] status=', res.status);
    console.log('[DEBUG CREATE] headers=', Object.fromEntries(res.headers.entries()));
    console.log('[DEBUG CREATE] body=', text);
  } catch (e) {
    console.error('ERROR', e);
  }
})();
