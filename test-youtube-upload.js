const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase config - read from env vars
function getClientFirebaseConfig() {
  const keys = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID'
  ];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('Missing required Firebase client env vars:', missing.join(', '));
    process.exit(1);
  }
  return {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID
  };
}

// Initialize Firebase
const app = initializeApp(getClientFirebaseConfig());
const functions = getFunctions(app);

async function testUploadVideoToYouTube() {
  try {
    const uploadVideoToYouTube = httpsCallable(functions, 'uploadVideoToYouTube');

    // Test data - this will fail because we don't have a real channelId or videoUrl
    const testData = {
      channelId: 'test-channel-id',
      title: 'Test Video',
      description: 'Test description',
      videoUrl: 'https://example.com/test.mp4',
      mimeType: 'video/mp4'
    };

    console.log('Testing uploadVideoToYouTube with mock data...');
    console.log('Expected: Should fail gracefully with "No YouTube token found for channel"');

    const result = await uploadVideoToYouTube(testData);
    console.log('Result:', result);
  } catch (error) {
    console.log('Expected error:', error.message);
    if (error.message.includes('No YouTube token found for channel')) {
      console.log('✅ Function handles missing token correctly');
    } else {
      console.log('❌ Unexpected error:', error);
    }
  }
}

testUploadVideoToYouTube();
