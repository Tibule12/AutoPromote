// live-fb-post.js
// Usage: node scripts/live-fb-post.js <PAGE_ID> <PAGE_ACCESS_TOKEN> ["message text"]

(async function(){
  const pageId = process.argv[2];
  const pageAccessToken = process.argv[3] || process.env.PAGE_ACCESS_TOKEN;
  const message = process.argv[4] || process.env.FB_POST_MESSAGE || 'Staging post from AutoPromote — test';

  if (!pageId || !pageAccessToken) {
    console.error('Usage: node scripts/live-fb-post.js <PAGE_ID> <PAGE_ACCESS_TOKEN> [message]');
    process.exit(1);
  }

  // Ensure fetch is available
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try { fetchFn = require('node-fetch'); global.fetch = fetchFn; } catch (e) { fetchFn = null; }
  }

  if (!fetchFn) {
    console.error('No fetch available (install node-fetch).');
    process.exit(2);
  }

  try {
    const params = new URLSearchParams({ access_token: pageAccessToken, message });
    const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    const resp = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(err || 'Graph API request failed');
    }

    const data = await resp.json();
    console.log('Facebook API response:', data);
    process.exit(0);
  } catch (e) {
    console.error('Live post failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
