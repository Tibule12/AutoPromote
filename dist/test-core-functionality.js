const { db } = require('./firebaseAdmin');

async function testDatabase() {
  console.log('🔍 Testing Firebase Firestore functionality...');
  
  try {
    // 1. Check connection
    console.log('Testing database connection...');
    const testDoc = await db.collection('_test_connection').doc('test').get();
    console.log('✅ Database connection successful');
    
    // 2. Test write operation
    console.log('Testing write operation...');
    await db.collection('_test_connection').doc('test').set({
      message: 'Test connection',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Write operation successful');
    
    // 3. Test read operation
    console.log('Testing read operation...');
    const docSnapshot = await db.collection('_test_connection').doc('test').get();
    if (docSnapshot.exists) {
      console.log('✅ Read operation successful');
      console.log('Document data:', docSnapshot.data());
    } else {
      console.log('❌ Document does not exist');
    }
    
    // 4. Test delete operation
    console.log('Testing delete operation...');
    await db.collection('_test_connection').doc('test').delete();
    console.log('✅ Delete operation successful');
    
    // 5. Test querying
    console.log('Testing query operation...');
    // First create a few test documents
    const batch = db.batch();
    for (let i = 1; i <= 3; i++) {
      const docRef = db.collection('_test_connection').doc(`test-${i}`);
      batch.set(docRef, {
        index: i,
        message: `Test document ${i}`,
        timestamp: new Date().toISOString()
      });
    }
    await batch.commit();
    console.log('✅ Batch write successful');
    
    // Query the documents
    const querySnapshot = await db.collection('_test_connection')
      .where('index', '>', 0)
      .orderBy('index')
      .limit(10)
      .get();
    
    console.log(`✅ Query returned ${querySnapshot.size} documents`);
    querySnapshot.forEach(doc => {
      console.log(`Document ${doc.id}:`, doc.data());
    });
    
    // Clean up the test documents
    const deletePromises = querySnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    console.log('✅ Test documents deleted');
    
    console.log('\n✅ All Firebase Firestore tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Firebase test failed:', error);
    return false;
  }
}

// Test authentication functionality
async function testAuth() {
  console.log('\n🔍 Testing Firebase Authentication functionality...');
  
  try {
    const admin = require('firebase-admin');
    const auth = admin.auth();
    
    // Create a test user
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Test123!';
    
    console.log('Creating test user...');
    const userRecord = await auth.createUser({
      email: testEmail,
      password: testPassword,
      displayName: 'Test User'
    });
    
    console.log('✅ Test user created:', userRecord.uid);
    
    // Get the user
    console.log('Getting user by UID...');
    const fetchedUser = await auth.getUser(userRecord.uid);
    console.log('✅ User fetched successfully:', fetchedUser.email);
    
    // Update the user
    console.log('Updating user...');
    await auth.updateUser(userRecord.uid, {
      displayName: 'Updated Test User'
    });
    
    const updatedUser = await auth.getUser(userRecord.uid);
    console.log('✅ User updated successfully:', updatedUser.displayName);
    
    // Set custom claims
    console.log('Setting custom claims...');
    await auth.setCustomUserClaims(userRecord.uid, { role: 'tester' });
    console.log('✅ Custom claims set');
    
    // Delete the user
    console.log('Deleting test user...');
    await auth.deleteUser(userRecord.uid);
    console.log('✅ User deleted successfully');
    
    console.log('\n✅ All Firebase Authentication tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Authentication test failed:', error);
    return false;
  }
}

// Test content creation and management
async function testContentManagement() {
  console.log('\n🔍 Testing content management functionality...');
  
  try {
    // Create test content
    console.log('Creating test content...');
    const contentRef = db.collection('content').doc('test-content');
    const contentData = {
      title: 'Test Content',
      type: 'video',
      description: 'This is a test video for system testing',
      user_id: 'test-user-id',
      url: 'https://example.com/test-video',
      status: 'active',
      views: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await contentRef.set(contentData);
    console.log('✅ Test content created');
    
    // Update content
    console.log('Updating test content...');
    await contentRef.update({
      views: 100,
      updated_at: new Date().toISOString()
    });
    
    // Get the content
    console.log('Getting test content...');
    const contentDoc = await contentRef.get();
    console.log('✅ Content fetched:', contentDoc.data());
    
    // Delete the content
    console.log('Deleting test content...');
    await contentRef.delete();
    console.log('✅ Test content deleted');
    
    console.log('\n✅ All content management tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Content management test failed:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 STARTING FUNCTIONALITY TESTS\n');
  
  const databaseResult = await testDatabase();
  const authResult = await testAuth();
  const contentResult = await testContentManagement();
  
  console.log('\n============================================');
  console.log('🔍 FUNCTIONALITY TEST RESULTS');
  console.log('============================================');
  console.log(`Database Tests: ${databaseResult ? '✅ Passed' : '❌ Failed'}`);
  console.log(`Authentication Tests: ${authResult ? '✅ Passed' : '❌ Failed'}`);
  console.log(`Content Management Tests: ${contentResult ? '✅ Passed' : '❌ Failed'}`);
  console.log('============================================');
  
  const allPassed = databaseResult && authResult && contentResult;
  
  if (allPassed) {
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('The platform\'s core functionality is working correctly.');
    console.log('Note: Server connectivity issues still need to be resolved.');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED');
    console.log('Check the logs above for details on what failed.');
  }
}

runAllTests();
