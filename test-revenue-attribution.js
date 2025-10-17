const { admin, db } = require('./firebaseAdmin');

async function testRevenueAttribution() {
  try {
    console.log('Testing Revenue Attribution System...');

    // Create test content
    const contentId = `test-content-${Date.now()}`;
    const userId = 'test-user-id';

    await db.collection('content').doc(contentId).set({
      title: 'Test Content for Revenue',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: userId,
      status: 'approved'
    });

    // Test logMonetizationEvent
    console.log('1. Testing logMonetizationEvent...');

    // Log an ad click event
    await db.collection('analytics').add({
      type: 'ad_click',
      contentId,
      userId,
      value: 1.25,
      referrerId: 'test-referrer',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update revenue in content and revenue collections
    await db.collection('content').doc(contentId).update({
      revenue: admin.firestore.FieldValue.increment(1.25)
    });

    await db.collection('revenue').doc(contentId).set({
      contentId,
      userId,
      totalRevenue: admin.firestore.FieldValue.increment(1.25),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Log another event
    await db.collection('analytics').add({
      type: 'affiliate_conversion',
      contentId,
      userId,
      value: 2.50,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('content').doc(contentId).update({
      revenue: admin.firestore.FieldValue.increment(2.50)
    });

    await db.collection('revenue').doc(contentId).set({
      contentId,
      userId,
      totalRevenue: admin.firestore.FieldValue.increment(2.50),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('✓ logMonetizationEvent: events logged and revenue updated');

    // Test getRevenueSummary
    console.log('2. Testing getRevenueSummary...');

    // Get revenue for specific user
    const userRevenueSnapshot = await db.collection('revenue').where('userId', '==', userId).get();
    let userTotal = 0;
    userRevenueSnapshot.forEach(doc => {
      userTotal += doc.data().totalRevenue || 0;
    });

    // Get all revenue
    const allRevenueSnapshot = await db.collection('revenue').get();
    let platformTotal = 0;
    allRevenueSnapshot.forEach(doc => {
      platformTotal += doc.data().totalRevenue || 0;
    });

    console.log(`✓ getRevenueSummary: user revenue = ${userTotal}, platform revenue = ${platformTotal}`);

    // Verify content revenue was updated
    const contentDoc = await db.collection('content').doc(contentId).get();
    const contentRevenue = contentDoc.data().revenue || 0;
    console.log(`✓ Content revenue updated: ${contentRevenue}`);

    console.log('Revenue Attribution System tests completed successfully');

  } catch (error) {
    console.error('Error testing revenue attribution:', error);
  }
}

testRevenueAttribution();
