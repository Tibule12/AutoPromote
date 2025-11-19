// redditService.js - Reddit submission API integration
const { db, admin } = require('../firebaseAdmin');
const { safeFetch } = require('../utils/ssrfGuard');

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require('node-fetch');
  } catch (e) {
    fetchFn = null;
  }
}

/**
 * Get user's Reddit connection tokens
 */
async function getUserRedditConnection(uid) {
  const snap = await db.collection('users').doc(uid).collection('connections').doc('reddit').get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserRedditConnection(uid);
  if (!connection || !connection.tokens) return null;
  
  const tokens = connection.tokens;
  const now = Date.now();
  
  // Check if token is still valid
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + (tokens.expires_in * 1000);
    if (now < expiresAt - 300000) { // 5 min buffer
      return tokens.access_token;
    }
  }
  
  // Try to refresh token
  if (tokens.refresh_token) {
    try {
      const refreshed = await refreshToken(uid, tokens.refresh_token);
      return refreshed.access_token;
    } catch (e) {
      console.warn('[Reddit] Token refresh failed:', e.message);
    }
  }
  
  return tokens.access_token;
}

/**
 * Refresh Reddit access token
 */
async function refreshToken(uid, refreshToken) {
  if (!fetchFn) throw new Error('Fetch not available');
  
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Reddit client credentials not configured');
  }
  
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await safeFetch('https://www.reddit.com/api/v1/access_token', fetchFn, {
    fetchOptions: {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AutoPromote/1.0'
      },
      body
    },
    requireHttps: true,
    allowHosts: ['www.reddit.com']
  });
  
  if (!response.ok) {
    throw new Error('Reddit token refresh failed');
  }
  
  const tokens = await response.json();
  
  // Store refreshed tokens
  const ref = db.collection('users').doc(uid).collection('connections').doc('reddit');
  await ref.set({
    tokens: {
      ...tokens,
      refresh_token: refreshToken // Reddit doesn't return new refresh token
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  return tokens;
}

/**
 * Submit a post to Reddit
 */
async function postToReddit({ uid, subreddit, title, text, url, contentId, kind = 'self', hashtags = [], hashtagString = '' }) {
  if (!uid) throw new Error('uid required');
  if (!subreddit) throw new Error('subreddit required');
  if (!title) throw new Error('title required');
  if (kind === 'self' && !text) throw new Error('text required for self posts');
  if (kind === 'link' && !url) throw new Error('url required for link posts');
  if (!fetchFn) throw new Error('Fetch not available');
  
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid Reddit access token');
  
  // Build submission payload
  const payload = new URLSearchParams({
    sr: subreddit,
    kind: kind, // 'self' for text, 'link' for URL, 'image' for image
    title: title.substring(0, 300), // Reddit title limit
    sendreplies: 'true',
    resubmit: 'false'
  });
  
  if (kind === 'self') {
    payload.append('text', text);
    // Append hashtags if any (format for reddit)
    try {
      if ((hashtags && hashtags.length > 0) || hashtagString) {
        const { formatHashtagsForPlatform } = require('./hashtagEngine');
        const hs = hashtagString || formatHashtagsForPlatform(hashtags, 'reddit');
        if (hs) payload.append('text', '\n\n' + hs);
      }
    } catch (_) {}
  } else if (kind === 'link') {
    payload.append('url', url);
    // Append hashtags to title for link posts
    if (hashtagString) payload.append('title', `${title} ${hashtagString}`.substring(0, 300));
  }
  
  // Submit post
  const response = await safeFetch('https://oauth.reddit.com/api/submit', fetchFn, {
    fetchOptions: {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AutoPromote/1.0'
      },
      body: payload
    },
    requireHttps: true,
    allowHosts: ['oauth.reddit.com']
  });
  
  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { raw: responseText };
  }
  
  if (!response.ok) {
    const errorMsg = responseData.message || responseData.error || 'Reddit posting failed';
    throw new Error(`Reddit posting failed: ${errorMsg}`);
  }
  
  // Reddit returns data in json.data.url format
  const postData = responseData.json?.data;
  const postId = postData?.id || postData?.name;
  const postUrl = postData?.url;
  const permalink = postData?.permalink ? `https://www.reddit.com${postData.permalink}` : postUrl;
  
  // Store post info in Firestore if contentId provided
  if (contentId && postId) {
    try {
      const contentRef = db.collection('content').doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().reddit || {} : {};
      
      await contentRef.set({
        reddit: {
          ...existingData,
          postId,
          subreddit,
          title,
          kind,
          url: permalink,
          postedAt: new Date().toISOString(),
          createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
    } catch (e) {
      console.warn('[Reddit] Failed to store post info in Firestore:', e.message);
    }
  }
  
  return {
    success: true,
    platform: 'reddit',
    postId,
    subreddit,
    url: permalink,
    raw: responseData
  };
}

/**
 * Get Reddit post information
 */
async function getPostInfo({ uid, postId }) {
  if (!uid) throw new Error('uid required');
  if (!postId) throw new Error('postId required');
  if (!fetchFn) throw new Error('Fetch not available');
  
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid Reddit access token');
  
  // Reddit post IDs can be in format "t3_xxxxx" or just "xxxxx"
  const fullId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
  
  const response = await safeFetch(`https://oauth.reddit.com/api/info?id=${fullId}`, fetchFn, {
    fetchOptions: {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AutoPromote/1.0'
      }
    },
    requireHttps: true,
    allowHosts: ['oauth.reddit.com']
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch Reddit post info');
  }
  
  const data = await response.json();
  const post = data.data?.children?.[0]?.data;
  
  if (!post) {
    throw new Error('Reddit post not found');
  }
  
  return {
    postId: post.id,
    title: post.title,
    subreddit: post.subreddit,
    author: post.author,
    score: post.score,
    upvoteRatio: post.upvote_ratio,
    numComments: post.num_comments,
    created: post.created_utc,
    url: `https://www.reddit.com${post.permalink}`,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Get subreddit information (to validate before posting)
 */
async function getSubredditInfo({ uid, subreddit }) {
  if (!uid) throw new Error('uid required');
  if (!subreddit) throw new Error('subreddit required');
  if (!fetchFn) throw new Error('Fetch not available');
  
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid Reddit access token');
  
  const response = await safeFetch(`https://oauth.reddit.com/r/${subreddit}/about`, fetchFn, {
    fetchOptions: {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AutoPromote/1.0'
      }
    },
    requireHttps: true,
    allowHosts: ['oauth.reddit.com']
  });
  
  if (!response.ok) {
    throw new Error('Subreddit not found or inaccessible');
  }
  
  const data = await response.json();
  const sub = data.data;
  
  return {
    name: sub.display_name,
    title: sub.title,
    subscribers: sub.subscribers,
    description: sub.public_description,
    over18: sub.over18,
    allowImages: sub.allow_images,
    allowVideos: sub.allow_videos
  };
}

module.exports = {
  getUserRedditConnection,
  getValidAccessToken,
  refreshToken,
  postToReddit,
  getPostInfo,
  getSubredditInfo
};
