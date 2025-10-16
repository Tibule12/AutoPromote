// Firebase Promotion Flow Test Script
// This script tests Firestore triggers for content promotion and tracking

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
  });
}

const db = admin.firestore();

async function runPromotionTest() {
  console.log('--- Firebase Promotion Flow Test ---');

  // 1. Create test content with status 'approved' (no intent fields yet)
  const contentRef = db.collection('content').doc();
  const testContent = {
    title: 'Test Promo Content',
    type: 'video',
    url: 'https://example.com/video.mp4',
    status: 'approved',
    user_id: 'testuser123',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await contentRef.set(testContent);
  console.log('✅ Test content created:', contentRef.id);

  // 2. Wait for promotion trigger
  console.log('⏳ Waiting 10 seconds for promotion trigger...');
  await new Promise(res => setTimeout(res, 10000));

  // 3. Check for promotion schedule
  const promoQuery = await db.collection('promotion_schedules')
    .where('contentId', '==', contentRef.id)
    .get();
  if (!promoQuery.empty) {
    console.log('✅ Promotion schedule created:', promoQuery.docs[0].id);
  } else {
    console.log('❌ Promotion schedule NOT created');
  }

  // 4. Update content to set landingPageRequestedAt
  await contentRef.update({ landingPageRequestedAt: new Date() });
  console.log('⏳ Waiting 10 seconds for landing page trigger...');
  await new Promise(res => setTimeout(res, 10000));

  // 5. Check for landing page URL
  const updatedContent1 = await contentRef.get();
  const data1 = updatedContent1.data();
  if (data1.landingPageUrl) {
    console.log('✅ Landing page URL generated:', data1.landingPageUrl);
  } else {
    console.log('❌ Landing page URL NOT generated');
  }

  // 6. Update content to set smartLinkRequestedAt
  await contentRef.update({ smartLinkRequestedAt: new Date() });
  console.log('⏳ Waiting 10 seconds for smart link trigger...');
  await new Promise(res => setTimeout(res, 10000));

  // 7. Check for smart link
  const updatedContent2 = await contentRef.get();
  const data2 = updatedContent2.data();
  if (data2.smartLink) {
    console.log('✅ Smart link generated:', data2.smartLink);
  } else {
    console.log('❌ Smart link NOT generated');
  }

  // 8. Cleanup test data
  await contentRef.delete();
  promoQuery.forEach(doc => doc.ref.delete());
  console.log('🧹 Test data cleaned up');

  console.log('--- Test Complete ---');
}

runPromotionTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
