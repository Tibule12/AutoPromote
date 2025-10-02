const express = require('express');
const fetch = require('node-fetch');
const { db } = require('../../firebaseAdmin');
const authMiddleware = require('../../authMiddleware');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

// Instagram relies on Facebook connection to get IG Business Account ID
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const fbSnap = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    if (!fbSnap.exists) return res.json({ connected: false });
    const data = fbSnap.data();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const pageSummary = pages.map(p => ({ id: p.id, name: p.name, has_ig: !!data.ig_business_account_id }));
    return res.json({ connected: true, ig_business_account_id: data.ig_business_account_id || null, pages: pageSummary });
  } catch (e) {
    return res.status(500).json({ connected: false, error: 'Failed to load IG status' });
  }
});

// Upload an image or reel to Instagram via IG Graph API
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { pageId, mediaUrl, caption, mediaType } = req.body || {};
    if (!pageId || !mediaUrl) return res.status(400).json({ error: 'pageId and mediaUrl are required' });
    const uid = req.userId || req.user?.uid;
    const fbSnap = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    if (!fbSnap.exists) return res.status(400).json({ error: 'Facebook not connected' });
    const data = fbSnap.data();
    const page = (data.pages || []).find(p => p.id === pageId);
    if (!page || !page.access_token) return res.status(400).json({ error: 'Page not found or missing access token' });

    // Retrieve IG Business Account ID for this page
    const igRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`);
    const igData = await igRes.json();
    const igId = igData?.instagram_business_account?.id || data.ig_business_account_id;
    if (!igId) return res.status(400).json({ error: 'Instagram business account not linked to page' });

    // Step 1: Create media container
    const isVideo = (mediaType || '').toLowerCase() === 'video';
    const createEndpoint = `https://graph.facebook.com/v19.0/${encodeURIComponent(igId)}/media`;
    const createBody = new URLSearchParams();
    createBody.set('access_token', page.access_token);
    if (isVideo) {
      createBody.set('media_type', 'REELS');
      createBody.set('video_url', mediaUrl);
    } else {
      createBody.set('image_url', mediaUrl);
    }
    if (caption) createBody.set('caption', caption);
    const createRes = await fetch(createEndpoint, { method: 'POST', body: createBody });
    const createData = await createRes.json();
    if (!createRes.ok) return res.status(400).json({ error: 'IG create media failed', details: createData });

    // Step 2: Publish media container
    const publishEndpoint = `https://graph.facebook.com/v19.0/${encodeURIComponent(igId)}/media_publish`;
    const pubBody = new URLSearchParams();
    pubBody.set('access_token', page.access_token);
    pubBody.set('creation_id', createData.id);
    const publishRes = await fetch(publishEndpoint, { method: 'POST', body: pubBody });
    const publishData = await publishRes.json();
    if (!publishRes.ok) return res.status(400).json({ error: 'IG publish failed', details: publishData });

    return res.json({ success: true, media_id: publishData.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
