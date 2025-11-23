// snapchatService.js
// Minimal Snapchat integration helpers: create creative (ad) or simulate
const { db } = require('../firebaseAdmin');
const { safeFetch } = require('../utils/ssrfGuard');

let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require('node-fetch'); } catch (_) { fetchFn = null; }
}

async function postToSnapchat({ contentId, payload, reason, uid }) {
  // For now, Snapchat posting is ad/creative oriented. We simulate a creative creation
  // if no ad account or access token exists for the user.
  let conn = null;
  try {
    const snap = await db.collection('users').doc(uid).collection('connections').doc('snapchat').get();
    if (snap.exists) conn = snap.data() || {};
  } catch (_) {}
  const hasAccessToken = conn && conn.accessToken;
  if (!hasAccessToken) return { platform: 'snapchat', simulated: true, reason: 'missing_credentials' };
  // Expect payload to include `media_url` or `creative` fields
  const creativePayload = {
    title: payload.title || payload.message || `AutoPromote ${contentId}`,
    description: payload.description || '',
    media_url: payload.mediaUrl || payload.url || null,
    campaign_id: payload.campaignId || (payload.platformOptions && payload.platformOptions.snapchat && payload.platformOptions.snapchat.campaignId) || null
  };
  try {
    const res = await safeFetch('https://adsapi.snapchat.com/v1/adaccounts/{ad_account_id}/creatives', fetchFn, {
      fetchOptions: {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creativePayload })
      },
      allowHosts: ['adsapi.snapchat.com'],
      requireHttps: true
    });
    const json = await (res.ok ? res.json() : res.text().then(t => ({ error: t })));
    if (!res.ok) return { platform: 'snapchat', success: false, error: json.error || JSON.stringify(json) };
    const creativeId = json.id || json.creative_id || null;
    if (contentId && creativeId && uid) {
      try { await db.collection('content').doc(contentId).set({ snapchat: { creativeId, createdAt: new Date().toISOString() } }, { merge: true }); } catch (_) {}
    }
    return { platform: 'snapchat', success: true, creativeId, raw: json };
  } catch (e) {
    return { platform: 'snapchat', success: false, error: e.message || 'snapchat_api_failed' };
  }
}

module.exports = { postToSnapchat };
