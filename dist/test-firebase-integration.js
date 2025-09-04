const admin = require('./firebaseAdmin');

async function testFirebaseConnection() {
  try {
    console.log('🔗 Testing Firebase connection and features...');
    
    // Test Firestore
    console.log('\n📊 Testing Firestore...');
    const testDoc = await admin.firestore().collection('test').doc('test-doc').set({
      message: 'Test connection',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Firestore write successful');
    
    const docSnapshot = await admin.firestore().collection('test').doc('test-doc').get();
    console.log('✅ Firestore read successful:', docSnapshot.data());
    
    await admin.firestore().collection('test').doc('test-doc').delete();
    console.log('✅ Firestore delete successful');

    // Test Authentication
    console.log('\n🔐 Testing Authentication...');
    const testUser = await admin.auth().createUser({
      email: `test-${Date.now()}@example.com`,
      password: 'Test123!',
      emailVerified: false,
      disabled: false
    });
    console.log('✅ User creation successful:', testUser.uid);

    await admin.auth().setCustomUserClaims(testUser.uid, { role: 'user' });
    console.log('✅ Custom claims set successful');

    await admin.auth().deleteUser(testUser.uid);
    console.log('✅ User deletion successful');

    // Test Storage
    console.log('\n📦 Testing Storage...');
    const bucket = admin.storage().bucket();
    const testFilePath = `test/test-${Date.now()}.txt`;
    const file = bucket.file(testFilePath);

    await file.save('Test content', {
      contentType: 'text/plain',
    });
    console.log('✅ Storage write successful');

    const [exists] = await file.exists();
    console.log('✅ Storage file exists:', exists);

    await file.delete();
    console.log('✅ Storage delete successful');

    console.log('\n✨ All Firebase tests passed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testFirebaseConnection();
}

module.exports = testFirebaseConnection;
