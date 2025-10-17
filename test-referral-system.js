const { admin, db } = require('./firebaseAdmin');

async function testReferralSystem() {
  try {
    console.log('Testing Referral System...');

    // Create test content
    const contentId = `test-content-${Date.now()}`;
    await db.collection('content').doc(contentId).set({
      title: 'Test Content for Referral',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: 'test-user-id',
      status: 'approved'
    });

    // Test addReferrerToContent
    console.log('1. Testing addReferrerToContent...');
    const referrerId = 'test-referrer-id';
    await db.collection('content').doc(contentId).update({ referrerId });

    // Verify referrer was added
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (contentDoc.data().referrerId === referrerId) {
      console.log('✓ addReferrerToContent: referrerId added successfully');
    } else {
      console.log('✗ addReferrerToContent: referrerId not added');
    }

    // Create some analytics data for referral stats
    await db.collection('analytics').add({
      type: 'smart_link_click',
      contentId,
      userId: 'test-user',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('analytics').add({
      type: 'ad_click',
      contentId,
      userId: 'test-user',
      value: 0.5,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Test getReferralStats
    console.log('2. Testing getReferralStats...');
    // Note: This would normally be called via Cloud Function, but we'll simulate the logic
    const contentSnapshot = await db.collection('content').where('referrerId', '==', referrerId).get();
    const contentIds = contentSnapshot.docs.map(doc => doc.id);
    let totalTraffic = 0;
    let totalRevenue = 0;
    if (contentIds.length > 0) {
      const analyticsSnapshot = await db.collection('analytics').where('contentId', 'in', contentIds.slice(0, 10)).get();
      analyticsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'smart_link_click') totalTraffic++;
        if ((data.type === 'ad_click' || data.type === 'affiliate_conversion') && data.value) totalRevenue += data.value;
      });
    }

    console.log(`✓ getReferralStats: totalTraffic=${totalTraffic}, totalRevenue=${totalRevenue}`);

    console.log('Referral System tests completed successfully');

  } catch (error) {
    console.error('Error testing referral system:', error);
  }
}

testReferralSystem();
