// instagramPublisher.js
// Basic Instagram Publishing via Facebook Graph API (Images / simple video URL)
// NOTE: Real production usage requires ensuring the media URL is publicly accessible and handling video processing states.
// Environment:
//   IG_USER_ID=<instagram_business_account_id>
//   FACEBOOK_PAGE_ACCESS_TOKEN=<page_access_token with instagram_basic, instagram_content_publish>
// Limitations:
//   - No carousel support yet
//   - For video: we attempt direct video_url container creation; processing polling minimal
//   - Falls back to simulated response if credentials missing or unsupported media

const fetch = require('node-fetch');
const { db } = require('../firebaseAdmin');

async function buildContentContext(contentId) {
  if (!contentId) return {};
  try {
    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) return {};
    const d = snap.data();
    return {
      title: d.title,
      description: d.description,
      landingPageUrl: d.landingPageUrl || d.smartLink || d.url,
      url: d.url,
      type: d.type,
      tags: d.tags || []
    };
  } catch (_) { return {}; }
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function publishInstagram({ contentId, payload, reason }) {
  const IG_USER_ID = process.env.IG_USER_ID;
  const ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN; // Re-use page token if it has IG perms
  if (!IG_USER_ID || !ACCESS_TOKEN) {
    return { platform: 'instagram', simulated: true, reason: 'missing_credentials' };
  }
  const ctx = await buildContentContext(contentId);
  const captionBase = payload?.caption || payload?.message || ctx.title || 'New post';
  const hashtags = (ctx.tags || []).slice(0,5).map(t=>`#${String(t).replace(/[^a-zA-Z0-9]/g,'')}`).join(' ');
  const caption = [captionBase, hashtags].filter(Boolean).join('\n');

  // Determine media URL preference order
  const mediaUrl = payload?.mediaUrl || ctx.url || ctx.landingPageUrl;
  if (!mediaUrl) {
    return { platform: 'instagram', simulated: true, reason: 'no_media_url' };
  }
  const isVideo = /\.mp4($|\?|#)/i.test(mediaUrl) || (ctx.type === 'video');

  const creationEndpoint = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    caption
  });
  if (isVideo) {
    params.append('media_type','VIDEO');
    params.append('video_url', mediaUrl);
  } else {
    params.append('image_url', mediaUrl);
  }

  let creationId;
  try {
    const createRes = await fetch(creationEndpoint, { method: 'POST', body: params });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      return { platform: 'instagram', success: false, stage: 'create', error: createJson.error?.message || JSON.stringify(createJson) };
    }
    creationId = createJson.id;
  } catch (e) {
    return { platform: 'instagram', success: false, stage: 'create', error: e.message };
  }

  // For video we should poll status; minimal attempt (2 quick polls)
  if (isVideo) {
    for (let i=0;i<2;i++) {
      await sleep(1500);
      try {
        const statusRes = await fetch(`https://graph.facebook.com/v18.0/${creationId}?fields=status_code&access_token=${ACCESS_TOKEN}`);
        const statusJson = await statusRes.json();
        if (statusJson.status_code === 'FINISHED') break;
        if (statusJson.status_code === 'ERROR') {
          return { platform: 'instagram', success: false, stage: 'processing', error: 'VIDEO_PROCESSING_ERROR' };
        }
      } catch(_) {}
    }
  }

  try {
    const publishRes = await fetch(`https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: creationId })
    });
    const publishJson = await publishRes.json();
    if (!publishRes.ok || !publishJson.id) {
      return { platform: 'instagram', success: false, stage: 'publish', error: publishJson.error?.message || JSON.stringify(publishJson) };
    }
    return { platform: 'instagram', success: true, mediaId: publishJson.id, reason, video: isVideo };
  } catch (e) {
    return { platform: 'instagram', success: false, stage: 'publish', error: e.message };
  }
}

module.exports = { publishInstagram };
