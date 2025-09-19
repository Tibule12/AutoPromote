// youtubeUploader.js
// Firebase Function to upload a video to YouTube using stored access tokens

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const region = 'us-central1';

// Helper: Get YouTube OAuth token from Firestore
async function getYouTubeToken(channelId) {
  const snapshot = await admin.firestore().collection('youtube_tokens')
    .where('channel.id', '==', channelId).limit(1).get();
  if (snapshot.empty) throw new Error('No YouTube token found for channel');
  return snapshot.docs[0].data();
}

// Helper: Upload video to YouTube
async function uploadToYouTube({ channelId, title, description, videoBuffer, mimeType }) {
  const tokenData = await getYouTubeToken(channelId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    scope: tokenData.scope,
    token_type: tokenData.token_type,
    expiry_date: Date.now() + (tokenData.expires_in * 1000)
  });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus: 'public' }
    },
    media: {
      mimeType,
      body: Buffer.isBuffer(videoBuffer) ? require('streamifier').createReadStream(videoBuffer) : videoBuffer
    }
  });
  return res.data;
}

// Callable function to trigger upload
exports.uploadVideoToYouTube = functions.region(region).https.onCall(async (data, context) => {
  // data: { channelId, title, description, videoUrl, mimeType }
  const { channelId, title, description, videoUrl, mimeType } = data;
  if (!channelId || !title || !videoUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'channelId, title, and videoUrl are required');
  }
  try {
    // Download video file
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error('Failed to download video');
    const videoBuffer = await videoRes.buffer();
    // Upload to YouTube
    const result = await uploadToYouTube({ channelId, title, description, videoBuffer, mimeType });
    return { success: true, result };
  } catch (error) {
    console.error('YouTube upload error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
