const { db, auth, admin } = require('./firebaseAdmin');

async function checkFirestorePermissions() {
  try {
    console.log('🔐 Checking Firestore Permissions...\n');

    // 1. Check if we can access the admin collection (which exists according to the link)
    console.log('1. Testing access to admin collection:');
    try {
      const adminDoc = await db.collection('admin').doc('WjeGjo77sFdJqz5pBU4V').get();
      if (adminDoc.exists) {
        console.log('   ✅ Can read admin collection');
        console.log('   Admin data:', JSON.stringify(adminDoc.data(), null, 2));
      } else {
        console.log('   ❌ Admin document not found');
      }
    } catch (error) {
      console.log('   ❌ Cannot access admin collection');
      console.log('   Error:', error.message);
    }

    // 2. Try to list all collections
    console.log('\n2. Testing collection listing:');
    try {
      const collections = await db.listCollections();
      console.log('   ✅ Can list collections');
      console.log('   Collections found:', collections.map(col => col.id));
    } catch (error) {
      console.log('   ❌ Cannot list collections');
      console.log('   Error:', error.message);
    }

    // 3. Try to create a test document in a new collection
    console.log('\n3. Testing document creation:');
    try {
      const testRef = db.collection('permissions_test').doc('test_doc');
      await testRef.set({
        timestamp: new Date().toISOString(),
        message: 'Testing service account permissions'
      });
      console.log('   ✅ Can create documents');

      // Clean up
      await testRef.delete();
      console.log('   ✅ Can delete documents');
    } catch (error) {
      console.log('   ❌ Cannot create/delete documents');
      console.log('   Error:', error.message);
    }

    // 4. Check Firestore rules (if accessible)
    console.log('\n4. Firestore Rules Status:');
    console.log('   📋 To check Firestore rules:');
    console.log('   1. Go to: https://console.firebase.google.com/project/autopromote-464de/firestore/rules');
    console.log('   2. Ensure rules allow service account access');
    console.log('   3. For development, use: allow read, write: if true;');

    // 5. Service Account Permissions Check
    console.log('\n5. Service Account Permissions:');
    console.log('   🔑 To check service account permissions:');
    console.log('   1. Go to: https://console.cloud.google.com/iam-admin/iam');
    console.log('   2. Find: firebase-adminsdk-fbsvc@autopromote-464de.iam.gserviceaccount.com');
    console.log('   3. Ensure it has: Cloud Datastore User role');

  } catch (error) {
    console.error('❌ Permission check failed:', error);
  } finally {
    process.exit(0);
  }
}

checkFirestorePermissions();
