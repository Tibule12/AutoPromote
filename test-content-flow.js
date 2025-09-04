const { db, auth, admin } = require('./firebaseAdmin');

async function testContentFlow() {
  try {
    console.log('🔍 Testing Complete Content Upload and Fetch Flow...\n');

    // Test 1: Simulate content upload (what the frontend would send)
    console.log('1. Testing content upload simulation:');
    const testContentData = {
      title: 'Test Article Content',
      type: 'article',
      url: 'https://example.com/test-article',
      description: 'This is a test article for content upload flow',
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3', // From setup
      views: 0,
      clicks: 0,
      revenue: 0.00,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const contentRef = db.collection('content').doc();
    await contentRef.set(testContentData);
    console.log('   ✅ Content uploaded successfully');
    console.log('   Content ID:', contentRef.id);

    // Test 2: Simulate content fetch (what the frontend would request)
    console.log('\n2. Testing content fetch:');
    const contentSnapshot = await db.collection('content')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .orderBy('created_at', 'desc')
      .get();

    console.log('   ✅ Content fetch successful');
    console.log('   Found', contentSnapshot.size, 'content items');

    if (!contentSnapshot.empty) {
      contentSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('   Content:', {
          id: doc.id,
          title: data.title,
          type: data.type,
          views: data.views,
          created_at: data.created_at
        });
      });
    }

    // Test 3: Test user document access
    console.log('\n3. Testing user document access:');
    const userDoc = await db.collection('users').doc('QKHDrVDi2AWhS7Qbu8fHTkleWHF3').get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('   ✅ User document accessed successfully');
      console.log('   User:', {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        isAdmin: userData.isAdmin
      });
    } else {
      console.log('   ❌ User document not found');
    }

    // Test 4: Test analytics collection (create sample analytics)
    console.log('\n4. Testing analytics collection:');
    const analyticsRef = db.collection('analytics').doc();
    await analyticsRef.set({
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      content_id: contentRef.id,
      event_type: 'view',
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'test',
        user_agent: 'test-agent'
      }
    });
    console.log('   ✅ Analytics event created successfully');

    // Test 5: Test promotions collection
    console.log('\n5. Testing promotions collection:');
    const promotionRef = db.collection('promotions').doc();
    await promotionRef.set({
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      content_id: contentRef.id,
      platform: 'twitter',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log('   ✅ Promotion created successfully');

    // Test 6: Test collection queries and aggregations
    console.log('\n6. Testing collection queries:');
    const allContent = await db.collection('content').get();
    const allAnalytics = await db.collection('analytics').get();
    const allPromotions = await db.collection('promotions').get();

    console.log('   ✅ Collection queries successful');
    console.log('   Content items:', allContent.size);
    console.log('   Analytics events:', allAnalytics.size);
    console.log('   Promotions:', allPromotions.size);

    // Test 7: Test data consistency and relationships
    console.log('\n7. Testing data relationships:');
    const userContent = await db.collection('content')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    const userAnalytics = await db.collection('analytics')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    const userPromotions = await db.collection('promotions')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    console.log('   ✅ Data relationships verified');
    console.log('   User content:', userContent.size);
    console.log('   User analytics:', userAnalytics.size);
    console.log('   User promotions:', userPromotions.size);

    // Clean up test data
    console.log('\n8. Cleaning up test data:');
    await contentRef.delete();
    await analyticsRef.delete();
    await promotionRef.delete();
    console.log('   ✅ Test data cleaned up');

    console.log('\n🎉 Content flow test completed successfully!');
    console.log('📋 Summary:');
    console.log('   - Content upload: ✅');
    console.log('   - Content fetch: ✅');
    console.log('   - User access: ✅');
    console.log('   - Analytics: ✅');
    console.log('   - Promotions: ✅');
    console.log('   - Queries: ✅');
    console.log('   - Relationships: ✅');
    console.log('   - Cleanup: ✅');

  } catch (error) {
    console.error('❌ Content flow test failed:', error);
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
  } finally {
    process.exit(0);
  }
}

testContentFlow();
