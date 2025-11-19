const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const fetch = require('node-fetch');

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

// Helper: Post to Instagram (placeholder - needs Graph API implementation)
async function postToInstagram({ message, url, instagramAccessToken, instagramUserId }) {
  // Placeholder: Instagram Graph API implementation needed
  // This would require creating a media container and publishing it
  console.log('Instagram posting not implemented yet');
  return { success: false, reason: 'not_implemented', message: 'Instagram posting requires Graph API implementation' };
}

// Helper: Post to TikTok (placeholder - needs Content Posting API)
async function postToTikTok({ message, url, tiktokAccessToken }) {
  // Placeholder: TikTok Content Posting API implementation needed
  console.log('TikTok posting not implemented yet');
  return { success: false, reason: 'not_implemented', message: 'TikTok posting requires Content Posting API implementation' };
}

// Helper: Post to YouTube (placeholder - needs YouTube Data API)
async function postToYouTube({ message, url, youtubeAccessToken }) {
  // Placeholder: YouTube Data API implementation needed
  console.log('YouTube posting not implemented yet');
  return { success: false, reason: 'not_implemented', message: 'YouTube posting requires Data API implementation' };
}

// Helper: Post to LinkedIn
async function postToLinkedIn({ message, url, linkedinAccessToken }) {
  // LinkedIn API v2 for posting to feed
  const endpoint = 'https://api.linkedin.com/v2/ugcPosts';
  const body = {
    "author": "urn:li:person:{person-id}", // Would need to get from token
    "lifecycleState": "PUBLISHED",
    "specificContent": {
      "com.linkedin.ugc.ShareContent": {
        "shareCommentary": {
          "text": `${message} ${url}`
        },
        "shareMediaCategory": "NONE"
      }
    },
    "visibility": {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
    }
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${linkedinAccessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// Helper: Post to Discord
async function postToDiscord({ message, url, discordBotToken, discordChannelId }) {
  // Discord API for posting to channel
  const endpoint = `https://discord.com/api/v10/channels/${discordChannelId}/messages`;
  const body = {
    content: `${message} ${url}`
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${discordBotToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// Helper: Post to Reddit
async function postToReddit({ message, url, redditAccessToken, redditSubreddit }) {
  // Reddit API for submitting a link post
  const endpoint = 'https://oauth.reddit.com/api/submit';
  const params = new URLSearchParams({
    kind: 'link',
    url: url,
    title: message,
    sr: redditSubreddit || 'test', // Default to r/test if not specified
    api_type: 'json'
  });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${redditAccessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'AutoPromote:v1.0.0 (by /u/autopromote)'
    },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.json?.errors?.[0]?.[1] || JSON.stringify(data));
  return data;
}

// Helper: Post to Spotify (placeholder - limited API)
async function postToSpotify({ message, url, spotifyAccessToken }) {
  // Spotify has limited API for posting - mainly for podcasts/artists
  // This would require Spotify for Artists API or similar
  console.log('Spotify posting not implemented yet - limited API availability');
  return { success: false, reason: 'not_implemented', message: 'Spotify posting requires Spotify for Artists API or similar' };
}

// Social Media Auto-Promotion Engine
exports.autoPromoteContent = functions.region(region).https.onCall(async (data, context) => {

  // data: { promotionId, platform, message, url, twitterBearerToken, facebookPageAccessToken, facebookPageId, instagramAccessToken, instagramUserId, tiktokAccessToken, youtubeAccessToken }
  const { promotionId, platform, message, url, twitterBearerToken, facebookPageAccessToken, facebookPageId, instagramAccessToken, instagramUserId, tiktokAccessToken, youtubeAccessToken, linkedinAccessToken, discordBotToken, discordChannelId, redditAccessToken, redditSubreddit, spotifyAccessToken } = data;
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
    } else if (platform === 'linkedin') {
      if (!linkedinAccessToken) throw new functions.https.HttpsError('invalid-argument', 'linkedinAccessToken required');
      postResult = await postToLinkedIn({ message, url, linkedinAccessToken });
    } else if (platform === 'discord') {
      if (!discordBotToken || !discordChannelId) throw new functions.https.HttpsError('invalid-argument', 'discordBotToken and discordChannelId required');
      postResult = await postToDiscord({ message, url, discordBotToken, discordChannelId });
    } else if (platform === 'reddit') {
      if (!redditAccessToken) throw new functions.https.HttpsError('invalid-argument', 'redditAccessToken required');
      postResult = await postToReddit({ message, url, redditAccessToken, redditSubreddit });
    } else if (platform === 'spotify') {
      if (!spotifyAccessToken) throw new functions.https.HttpsError('invalid-argument', 'spotifyAccessToken required');
      postResult = await postToSpotify({ message, url, spotifyAccessToken });
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
