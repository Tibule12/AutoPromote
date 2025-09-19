const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const fetch = require('node-fetch');
const { postToInstagram, postToTikTok, postToYouTube } = require('./socialPlatformHelpers');

const region = 'us-central1';

// Helper: Post to Twitter (X)
async function postToTwitter({ message, url, twitterBearerToken }) {
  // Twitter API v2 tweet endpoint
  const endpoint = 'https://api.twitter.com/2/tweets';
  const body = { text: `${message} ${url}` };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${twitterBearerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Helper: Post to Facebook Page
async function postToFacebook({ message, url, facebookPageAccessToken, facebookPageId }) {
  const endpoint = `https://graph.facebook.com/${facebookPageId}/feed`;
  const params = new URLSearchParams({
    message: `${message} ${url}`,
    access_token: facebookPageAccessToken
  });
  const res = await fetch(`${endpoint}?${params.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
}

// Social Media Auto-Promotion Engine
exports.autoPromoteContent = functions.region(region).https.onCall(async (data, context) => {

  // data: { promotionId, platform, message, url, twitterBearerToken, facebookPageAccessToken, facebookPageId, instagramAccessToken, instagramUserId, tiktokAccessToken, youtubeAccessToken }
  const { promotionId, platform, message, url, twitterBearerToken, facebookPageAccessToken, facebookPageId, instagramAccessToken, instagramUserId, tiktokAccessToken, youtubeAccessToken } = data;
  if (!promotionId || !platform || !message || !url) {
    throw new functions.https.HttpsError('invalid-argument', 'promotionId, platform, message, and url are required');
  }
  try {
    let postResult;
    if (platform === 'twitter') {
      if (!twitterBearerToken) throw new functions.https.HttpsError('invalid-argument', 'twitterBearerToken required');
      postResult = await postToTwitter({ message, url, twitterBearerToken });
    } else if (platform === 'facebook') {
      if (!facebookPageAccessToken || !facebookPageId) throw new functions.https.HttpsError('invalid-argument', 'facebookPageAccessToken and facebookPageId required');
      postResult = await postToFacebook({ message, url, facebookPageAccessToken, facebookPageId });
    } else if (platform === 'instagram') {
      if (!instagramAccessToken || !instagramUserId) throw new functions.https.HttpsError('invalid-argument', 'instagramAccessToken and instagramUserId required');
      postResult = await postToInstagram({ message, url, instagramAccessToken, instagramUserId });
    } else if (platform === 'tiktok') {
      if (!tiktokAccessToken) throw new functions.https.HttpsError('invalid-argument', 'tiktokAccessToken required');
      postResult = await postToTikTok({ message, url, tiktokAccessToken });
    } else if (platform === 'youtube') {
      if (!youtubeAccessToken) throw new functions.https.HttpsError('invalid-argument', 'youtubeAccessToken required');
      postResult = await postToYouTube({ message, url, youtubeAccessToken });
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported platform');
    }
    // Log post status and engagement in Firestore
    await admin.firestore().collection('promotions').doc(promotionId).update({
      postStatus: 'posted',
      postResult,
      postedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await admin.firestore().collection('analytics').add({
      type: 'promotion_post',
      promotionId,
      platform,
      result: postResult,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, postResult };
  } catch (error) {
    console.error('Error in autoPromoteContent:', error);
    await admin.firestore().collection('promotions').doc(promotionId).update({
      postStatus: 'failed',
      postError: error.message,
      postedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    throw new functions.https.HttpsError('internal', error.message);
  }
});
