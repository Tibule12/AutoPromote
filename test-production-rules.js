const { db, auth, admin } = require('./firebaseAdmin');

async function testProductionRules() {
  try {
    console.log('🔍 Testing Production Firestore Rules...\n');

    // Test 1: Create a test user document
    console.log('1. Testing user document creation:');
    try {
      const userRef = db.collection('users').doc('test_user_123');
      await userRef.set({
        email: 'test@example.com',
        role: 'user',
        created_at: new Date().toISOString()
      });
      console.log('   ✅ User document created successfully');
    } catch (error) {
      console.log('   ❌ User document creation failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

    // Test 2: Create a test content document
    console.log('\n2. Testing content document creation:');
    try {
      const contentRef = db.collection('content').doc('test_content_123');
      await contentRef.set({
        title: 'Test Content',
        type: 'article',
        url: 'https://example.com',
        description: 'Test description',
        user_id: 'test_user_123',
        views: 0,
        clicks: 0,
        revenue: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log('   ✅ Content document created successfully');
    } catch (error) {
      console.log('   ❌ Content document creation failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

    // Test 3: Read documents
    console.log('\n3. Testing document reading:');
    try {
      const userDoc = await db.collection('users').doc('test_user_123').get();
      if (userDoc.exists) {
        console.log('   ✅ User document read successfully');
      } else {
        console.log('   ❌ User document not found');
      }

      const contentDoc = await db.collection('content').doc('test_content_123').get();
      if (contentDoc.exists) {
        console.log('   ✅ Content document read successfully');
      } else {
        console.log('   ❌ Content document not found');
      }
    } catch (error) {
      console.log('   ❌ Document reading failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

    // Test 4: Update document
    console.log('\n4. Testing document update:');
    try {
      await db.collection('content').doc('test_content_123').update({
        views: 10,
        updated_at: new Date().toISOString()
      });
      console.log('   ✅ Content document updated successfully');
    } catch (error) {
      console.log('   ❌ Content document update failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

    // Test 5: List collections
    console.log('\n5. Testing collection listing:');
    try {
      const collections = await db.listCollections();
      console.log('   ✅ Collections listed successfully');
      console.log('   Collections found:', collections.length);
      if (collections.length > 0) {
        console.log('   Collection names:', collections.map(col => col.id));
      }
    } catch (error) {
      console.log('   ❌ Collection listing failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

    // Clean up test documents
    console.log('\n6. Cleaning up test documents:');
    try {
      await db.collection('users').doc('test_user_123').delete();
      await db.collection('content').doc('test_content_123').delete();
      console.log('   ✅ Test documents cleaned up');
    } catch (error) {
      console.log('   ❌ Cleanup failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testProductionRules();
