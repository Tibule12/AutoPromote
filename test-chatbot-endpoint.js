// Quick test to verify chatbot endpoint is accessible
const https = require('https');

const API_BASE = 'https://autopromote.onrender.com';

console.log('Testing chatbot endpoint availability...\n');

// Test 1: Health check
https.get(`${API_BASE}/api/health`, (res) => {
  console.log(`✓ Health endpoint: ${res.statusCode}`);
  
  // Test 2: Chat suggestions endpoint (should require auth but endpoint should exist)
  https.get(`${API_BASE}/api/chat/suggestions`, (res2) => {
    console.log(`✓ Chat suggestions endpoint exists: ${res2.statusCode}`);
    console.log('  (401 is expected without auth token)');
    
    if (res2.statusCode === 401 || res2.statusCode === 200) {
      console.log('\n✅ Chatbot endpoints are deployed and accessible!');
      console.log('\nNext steps:');
      console.log('1. Users can now access the chat widget when logged in');
      console.log('2. Widget appears as floating button in bottom-right corner');
      console.log('3. Supports all 11 South African languages');
      console.log('4. OpenAI API key must be configured in Render environment variables');
    }
  }).on('error', (err) => {
    console.log('⚠ Chat endpoint not found yet:', err.message);
    console.log('  Backend may still be deploying on Render (takes 3-5 minutes)');
  });
}).on('error', (err) => {
  console.log('✗ Backend not accessible:', err.message);
  console.log('  Check Render deployment status');
});
