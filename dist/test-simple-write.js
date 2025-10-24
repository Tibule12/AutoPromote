const { db, auth, admin } = require('./firebaseAdmin');

async function testSimpleWrite() {
  try {
    console.log('🔍 Testing simple Firestore write...\n');

    // Try to create a simple test document
    console.log('Creating test document...');
    const testRef = db.collection('test').doc('simple_test');

    await testRef.set({
      message: 'Simple test document',
      timestamp: new Date().toISOString(),
      success: true
    });

    console.log('✅ Document created successfully!');
    console.log('Document path: test/simple_test');

    // Try to read it back
    const doc = await testRef.get();
    if (doc.exists) {
      console.log('✅ Document read successfully!');
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
    }

    // Clean up
    await testRef.delete();
    console.log('✅ Document deleted successfully!');

    console.log('\n🎉 All Firestore operations successful!');
    console.log('You can now run: node setup-firestore-for-user.js');

  } catch (error) {
    console.log('❌ Test failed');
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);

    if (error.code === 'PERMISSION_DENIED') {
      console.log('\n📋 SOLUTION: Firestore rules are blocking access');
  console.log('Go to: https://console.firebase.google.com/project/autopromote-cc6d3/firestore/rules');
      console.log('Make sure rules are:');
      console.log('```');
      console.log('rules_version = \'2\';');
      console.log('service cloud.firestore {');
      console.log('  match /databases/{database}/documents {');
      console.log('    match /{document=**} {');
      console.log('      allow read, write: if true;');
      console.log('    }');
      console.log('  }');
      console.log('}');
      console.log('```');
      console.log('Then click "Publish" and wait 1-2 minutes');
    } else if (error.code === 'NOT_FOUND') {
      console.log('\n📋 This indicates the Firestore database may not exist or rules are blocking access');
    }
  } finally {
    process.exit(0);
  }
}

testSimpleWrite();
