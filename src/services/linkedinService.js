// linkedinService.js - LinkedIn Share API integration
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
 * Get user's LinkedIn connection tokens
 */
async function getUserLinkedInConnection(uid) {
  const snap = await db.collection('users').doc(uid).collection('connections').doc('linkedin').get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserLinkedInConnection(uid);
  if (!connection || !connection.tokens) return null;
  
  const tokens = connection.tokens;
  const now = Date.now();
  
  // Check if token is still valid (LinkedIn tokens typically last 60 days)
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + (tokens.expires_in * 1000);
    if (now < expiresAt - 300000) { // 5 min buffer
      return tokens.access_token;
    }
  }
  
  // LinkedIn doesn't support refresh tokens in the same way as Twitter
  // Tokens last 60 days, so if expired, user needs to re-authenticate
  return tokens.access_token;
}

/**
 * Get LinkedIn user profile (person URN)
 */
async function getUserProfile(accessToken) {
  if (!fetchFn) throw new Error('Fetch not available');
  
  const response = await safeFetch('https://api.linkedin.com/v2/me', fetchFn, {
    fetchOptions: {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    },
    requireHttps: true,
    allowHosts: ['api.linkedin.com']
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get LinkedIn profile: ${error}`);
  }
  
  const profile = await response.json();
  return profile.id; // Returns the person URN ID
}

/**
 * Upload image to LinkedIn for use in posts
 */
async function uploadImage({ uid, imageUrl }) {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid LinkedIn access token');
  
  const personId = await getUserProfile(accessToken);
  
  // Step 1: Register upload
  const registerResponse = await safeFetch('https://api.linkedin.com/v2/assets?action=registerUpload', fetchFn, {
    fetchOptions: {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: `urn:li:person:${personId}`,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      })
    },
    requireHttps: true,
    allowHosts: ['api.linkedin.com']
  });
  
  if (!registerResponse.ok) {
    throw new Error('Failed to register LinkedIn image upload');
  }
  
  const registerData = await registerResponse.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerData.value.asset;
  
  // Step 2: Download image
  const imageResponse = await safeFetch(imageUrl, fetchFn, { requireHttps: true });
  if (!imageResponse.ok) throw new Error('Failed to download image');
  const imageBuffer = await imageResponse.buffer();
  
  // Step 3: Upload image
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: imageBuffer
  });
  
  if (!uploadResponse.ok) {
    throw new Error('Failed to upload image to LinkedIn');
  }
  
  return asset; // Return asset URN
}

/**
 * Post to LinkedIn (text, image, or article)
 */
async function postToLinkedIn({ uid, text, imageUrl, articleUrl, articleTitle, articleDescription, contentId, hashtags = [], hashtagString = '', companyId = null, personId: personIdParam = null }) {
  if (!uid) throw new Error('uid required');
  if (!text && !articleUrl) throw new Error('text or articleUrl required');
  if (!fetchFn) throw new Error('Fetch not available');
  
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid LinkedIn access token');
  
  // If a companyId is provided, use org posting rules; otherwise get person ID
  const resolvedPersonId = personIdParam || await getUserProfile(accessToken);
  const authorUrn = companyId ? `urn:li:organization:${companyId}` : `urn:li:person:${resolvedPersonId}`;
  
  // Build share payload
  const sharePayload = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
            text: (text || '') + (hashtagString ? ` ${hashtagString}` : '')
        },
        shareMediaCategory: 'NONE'
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };
  
  // Add image if provided
  if (imageUrl) {
    try {
      const assetUrn = await uploadImage({ uid, imageUrl });
      sharePayload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
      sharePayload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
        status: 'READY',
        media: assetUrn
      }];
    } catch (e) {
      console.warn('[LinkedIn] Image upload failed, posting without image:', e.message);
    }
  }
  
  // Add article if provided
  if (articleUrl) {
    sharePayload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
    sharePayload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
      status: 'READY',
      originalUrl: articleUrl,
      title: {
        text: articleTitle || 'Article'
      },
      description: {
        text: articleDescription || ''
      }
    }];
  }
  
  // Post to LinkedIn
  const response = await safeFetch('https://api.linkedin.com/v2/ugcPosts', fetchFn, {
    fetchOptions: {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(sharePayload)
    },
    requireHttps: true,
    allowHosts: ['api.linkedin.com']
  });
  
  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { raw: responseText };
  }
  
  if (!response.ok) {
    const errorMsg = responseData.message || responseData.error || 'LinkedIn posting failed';
    throw new Error(`LinkedIn posting failed: ${errorMsg}`);
  }
  
  const shareId = responseData.id;
  const shareUrl = `https://www.linkedin.com/feed/update/${shareId}`;
  
  // Store post info in Firestore if contentId provided
  if (contentId && shareId) {
    try {
      const contentRef = db.collection('content').doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().linkedin || {} : {};
      
      await contentRef.set({
        linkedin: {
          ...existingData,
          shareId,
          text: text || '',
          postedAt: new Date().toISOString(),
          createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
    } catch (e) {
      console.warn('[LinkedIn] Failed to store post info in Firestore:', e.message);
    }
  }
  
  return {
    success: true,
    platform: 'linkedin',
    shareId,
    url: shareUrl,
    raw: responseData
  };
}

/**
 * Get LinkedIn post statistics
 */
async function getPostStats({ uid, shareId }) {
  if (!uid) throw new Error('uid required');
  if (!shareId) throw new Error('shareId required');
  if (!fetchFn) throw new Error('Fetch not available');
  
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error('No valid LinkedIn access token');
  
  // LinkedIn uses a different endpoint for analytics
  const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareId)}/(likes,comments)`;
  
  const response = await safeFetch(url, fetchFn, {
    fetchOptions: {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    },
    requireHttps: true,
    allowHosts: ['api.linkedin.com']
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch LinkedIn post stats');
  }
  
  const data = await response.json();
  
  return {
    shareId,
    likes: data.likes?.paging?.total || 0,
    comments: data.comments?.paging?.total || 0,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  getUserLinkedInConnection,
  getValidAccessToken,
  postToLinkedIn,
  uploadImage,
  getPostStats
};
