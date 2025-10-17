const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase config - replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyD_your_api_key_here", // You'll need to get this from Firebase console
  authDomain: "autopromote-cc6d3.firebaseapp.com",
  projectId: "autopromote-cc6d3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
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
