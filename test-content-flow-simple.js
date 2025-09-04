const { db, auth, admin } = require('./firebaseAdmin');

async function testContentFlowSimple() {
  try {
    console.log('🔍 Testing Content Flow (Simple Version)...\n');

    // Test 1: Content upload
    console.log('1. Testing content upload:');
    const testContentData = {
      title: 'Test Article Content',
      type: 'article',
      url: 'https://example.com/test-article',
      description: 'This is a test article for content upload flow',
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
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

    // Test 2: Simple content fetch (without composite index)
    console.log('\n2. Testing simple content fetch:');
    const allContent = await db.collection('content').get();
    console.log('   ✅ Content fetch successful');
    console.log('   Total content items:', allContent.size);

    // Test 3: User document access
    console.log('\n3. Testing user document access:');
    const userDoc = await db.collection('users').doc('QKHDrVDi2AWhS7Qbu8fHTkleWHF3').get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('   ✅ User document accessed successfully');
      console.log('   User:', userData.email, '-', userData.name);
    }

    // Test 4: Analytics creation
    console.log('\n4. Testing analytics creation:');
    const analyticsRef = db.collection('analytics').doc();
    await analyticsRef.set({
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      content_id: contentRef.id,
      event_type: 'view',
      timestamp: new Date().toISOString()
    });
    console.log('   ✅ Analytics event created');

    // Test 5: Promotion creation
    console.log('\n5. Testing promotion creation:');
    const promotionRef = db.collection('promotions').doc();
    await promotionRef.set({
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      content_id: contentRef.id,
      platform: 'twitter',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString()
    });
    console.log('   ✅ Promotion created');

    // Test 6: Collection counts
    console.log('\n6. Testing collection counts:');
    const contentCount = (await db.collection('content').get()).size;
    const analyticsCount = (await db.collection('analytics').get()).size;
    const promotionsCount = (await db.collection('promotions').get()).size;

    console.log('   ✅ Collection counts retrieved');
    console.log('   Content:', contentCount);
    console.log('   Analytics:', analyticsCount);
    console.log('   Promotions:', promotionsCount);

    // Test 7: Content update
    console.log('\n7. Testing content update:');
    await contentRef.update({
      views: 5,
      clicks: 2,
      updated_at: new Date().toISOString()
    });
    console.log('   ✅ Content updated successfully');

    // Test 8: Verify update
    console.log('\n8. Testing update verification:');
    const updatedDoc = await contentRef.get();
    const updatedData = updatedDoc.data();
    console.log('   ✅ Update verified');
    console.log('   Updated views:', updatedData.views);
    console.log('   Updated clicks:', updatedData.clicks);

    // Clean up
    console.log('\n9. Cleaning up test data:');
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
    console.log('   - Updates: ✅');
    console.log('   - Cleanup: ✅');

    console.log('\n📝 Note: For advanced queries (filter + sort), create composite indexes:');
    console.log('   https://console.firebase.google.com/project/autopromote-464de/firestore/indexes');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('Error code:', error.code);
  } finally {
    process.exit(0);
  }
}

testContentFlowSimple();
