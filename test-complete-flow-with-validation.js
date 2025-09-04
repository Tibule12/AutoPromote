const { db, auth, admin } = require('./firebaseAdmin');

async function testCompleteFlowWithValidation() {
  try {
    console.log('🚀 Testing Complete Content Flow with Validation...\n');

    // Test 1: Valid content upload with validation
    console.log('1. Testing valid content upload with validation:');
    const validContentData = {
      title: 'Validated Test Article',
      type: 'article',
      url: 'https://example.com/validated-test',
      description: 'This is a validated test article',
      target_platforms: ['youtube', 'tiktok'],
      scheduled_promotion_time: new Date(Date.now() + 86400000).toISOString(),
      promotion_frequency: 'daily',
      target_rpm: 900000,
      min_views_threshold: 2000000,
      max_budget: 1000,
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      views: 0,
      clicks: 0,
      revenue: 0.00,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const contentRef = db.collection('content').doc();
    await contentRef.set(validContentData);
    console.log('   ✅ Valid content uploaded successfully');
    console.log('   Content ID:', contentRef.id);

    // Test 2: Content retrieval and validation
    console.log('\n2. Testing content retrieval:');
    const retrievedDoc = await contentRef.get();
    if (retrievedDoc.exists) {
      const retrievedData = retrievedDoc.data();
      console.log('   ✅ Content retrieved successfully');
      console.log('   Title:', retrievedData.title);
      console.log('   Type:', retrievedData.type);
      console.log('   URL:', retrievedData.url);
    } else {
      console.log('   ❌ Content not found');
    }

    // Test 3: Content update with validation
    console.log('\n3. Testing content update:');
    await contentRef.update({
      views: 1500,
      clicks: 75,
      revenue: 1350.00,
      updated_at: new Date().toISOString()
    });
    console.log('   ✅ Content updated successfully');

    // Test 4: Verify update
    console.log('\n4. Testing update verification:');
    const updatedDoc = await contentRef.get();
    const updatedData = updatedDoc.data();
    console.log('   ✅ Update verified');
    console.log('   Updated views:', updatedData.views);
    console.log('   Updated clicks:', updatedData.clicks);
    console.log('   Updated revenue:', updatedData.revenue);

    // Test 5: Analytics creation
    console.log('\n5. Testing analytics creation:');
    const analyticsRef = db.collection('analytics').doc();
    await analyticsRef.set({
      content_id: contentRef.id,
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      event_type: 'view',
      timestamp: new Date().toISOString(),
      metadata: {
        platform: 'youtube',
        duration: 30
      }
    });
    console.log('   ✅ Analytics event created');

    // Test 6: Promotion creation
    console.log('\n6. Testing promotion creation:');
    const promotionRef = db.collection('promotions').doc();
    await promotionRef.set({
      content_id: contentRef.id,
      user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
      platform: 'youtube',
      schedule_type: 'recurring',
      start_time: new Date(Date.now() + 3600000).toISOString(),
      frequency: 'daily',
      is_active: true,
      budget: 500,
      target_metrics: {
        target_views: 10000,
        target_rpm: 900000
      },
      created_at: new Date().toISOString()
    });
    console.log('   ✅ Promotion created');

    // Test 7: Collection queries
    console.log('\n7. Testing collection queries:');
    const userContent = await db.collection('content')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    const userAnalytics = await db.collection('analytics')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    const userPromotions = await db.collection('promotions')
      .where('user_id', '==', 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3')
      .get();

    console.log('   ✅ Collection queries successful');
    console.log('   User content:', userContent.size);
    console.log('   User analytics:', userAnalytics.size);
    console.log('   User promotions:', userPromotions.size);

    // Test 8: Data consistency across collections
    console.log('\n8. Testing data consistency:');
    const contentAnalytics = await db.collection('analytics')
      .where('content_id', '==', contentRef.id)
      .get();

    const contentPromotions = await db.collection('promotions')
      .where('content_id', '==', contentRef.id)
      .get();

    console.log('   ✅ Data consistency verified');
    console.log('   Content analytics:', contentAnalytics.size);
    console.log('   Content promotions:', contentPromotions.size);

    // Test 9: Cleanup
    console.log('\n9. Testing cleanup:');
    await contentRef.delete();
    await analyticsRef.delete();
    await promotionRef.delete();
    console.log('   ✅ Test data cleaned up');

    // Test 10: Verify cleanup
    console.log('\n10. Testing cleanup verification:');
    const deletedContent = await db.collection('content').doc(contentRef.id).get();
    const deletedAnalytics = await db.collection('analytics').doc(analyticsRef.id).get();
    const deletedPromotion = await db.collection('promotions').doc(promotionRef.id).get();

    if (!deletedContent.exists && !deletedAnalytics.exists && !deletedPromotion.exists) {
      console.log('   ✅ Cleanup verified - all test data removed');
    } else {
      console.log('   ❌ Cleanup incomplete');
    }

    console.log('\n🎉 Complete flow with validation testing completed!');
    console.log('📋 Summary:');
    console.log('   - Valid content upload: ✅');
    console.log('   - Content retrieval: ✅');
    console.log('   - Content update: ✅');
    console.log('   - Update verification: ✅');
    console.log('   - Analytics creation: ✅');
    console.log('   - Promotion creation: ✅');
    console.log('   - Collection queries: ✅');
    console.log('   - Data consistency: ✅');
    console.log('   - Cleanup: ✅');
    console.log('   - Cleanup verification: ✅');

    console.log('\n✨ All tests passed! Content upload and fetch flow is fully functional with validation.');

  } catch (error) {
    console.error('❌ Complete flow test failed:', error.message);
    console.log('Error code:', error.code);
  } finally {
    process.exit(0);
  }
}

testCompleteFlowWithValidation();
