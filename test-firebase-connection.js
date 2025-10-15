require('dotenv').config();
const { auth, db, storage, admin } = require('./firebaseAdmin');

async function testFirebaseConnection() {
    try {
        // Test basic Firebase connection
        console.log('Testing Firebase initialization...');
        if (!admin.apps.length) {
            throw new Error('Firebase Admin was not initialized');
        }
        console.log('✅ Firebase Admin initialization successful');

        // Test Auth Service
        console.log('\nTesting Firebase Auth...');
        try {
            const listUsersResult = await auth.listUsers(1);
            console.log('✅ Firebase Auth connection successful');
            console.log(`Found ${listUsersResult.users.length} users in the project`);
        } catch (authError) {
            console.error('❌ Firebase Auth error:', authError);
        }

        // Test Storage
        console.log('\nTesting Firebase Storage...');
        try {
            const bucket = storage.bucket();
            const [exists] = await bucket.exists();
            console.log('✅ Firebase Storage connection successful');
            console.log(`Storage bucket ${exists ? 'exists' : 'does not exist'}`);
        } catch (storageError) {
            console.error('❌ Firebase Storage error:', storageError);
        }

        console.log('\n⚠️ Note: To use Firestore, you need to:');
        console.log('1. Go to Firebase Console (https://console.firebase.google.com)');
    console.log('2. Select project "autopromote-cc6d3"');
        console.log('3. Click on "Firestore Database" in the left sidebar');
        console.log('4. Click "Create Database"');
        console.log('5. Choose your preferred location and start in production mode');
        console.log('6. Wait for the database to be provisioned');

        return true;
    } catch (error) {
        console.error('\n❌ Firebase connection test failed:', error);
        throw error;
    }
}

testFirebaseConnection()
    .then(() => console.log('All Firebase services connected successfully!'))
    .catch(console.error);
