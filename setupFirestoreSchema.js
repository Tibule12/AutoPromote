// setupFirestoreSchema.js
// Script to initialize Firestore collections with sample documents
const { db } = require('./firebaseAdmin');

async function setupFirestoreSchema() {
  try {
    // 1. Create a sample user
    const userId = 'sample-user-1';
    const userData = {
      id: userId,
      name: 'Sample User',
      email: 'sampleuser@example.com',
      role: 'user',
      createdAt: new Date(),
      status: 'active',
      preferences: {
        notifications: true,
        theme: 'light',
      },
    };
    await db.collection('users').doc(userId).set(userData);
    console.log('✅ Created sample user');

    // 2. Create a sample content document
    const contentId = 'sample-content-1';
    const contentData = {
      id: contentId,
      userId: userId,
      title: 'Sample Content',
      type: 'article',
      url: 'https://example.com/sample-content',
      description: 'This is a sample content item.',
      createdAt: new Date(),
      status: 'active',
      views: 0,
      engagementRate: 0.0,
      tags: ['sample', 'test'],
      category: 'general',
      metadata: {
        duration: 120,
        dimensions: { width: 1920, height: 1080 },
        fileSize: 2048,
      },
    };
    await db.collection('content').doc(contentId).set(contentData);
    console.log('✅ Created sample content');

    // 3. Create a sample promotion document
    const promotionId = 'sample-promotion-1';
    const promotionData = {
      id: promotionId,
      contentId: contentId,
      userId: userId,
      status: 'scheduled',
      platform: 'twitter',
      scheduledFor: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      createdAt: new Date(),
    };
    await db.collection('promotions').doc(promotionId).set(promotionData);
    console.log('✅ Created sample promotion');

    // 4. Create a sample analytics document
    const analyticsId = 'sample-analytics-1';
    const analyticsData = {
      id: analyticsId,
      userId: userId,
      contentId: contentId,
      views: 10,
      clicks: 2,
      createdAt: new Date(),
    };
    await db.collection('analytics').doc(analyticsId).set(analyticsData);
    console.log('✅ Created sample analytics');

    // 5. Create a sample activity document
    const activityId = 'sample-activity-1';
    const activityData = {
      id: activityId,
      userId: userId,
      type: 'login',
      details: { ip: '127.0.0.1' },
      createdAt: new Date(),
    };
    await db.collection('activities').doc(activityId).set(activityData);
    console.log('✅ Created sample activity');

    console.log('🎉 Firestore schema setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up Firestore schema:', error);
    process.exit(1);
  }
}

setupFirestoreSchema();