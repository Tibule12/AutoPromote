require('dotenv').config();
const { db } = require('./firebaseAdmin');

async function testFirestore() {
    try {
        console.log('🔄 Testing Firestore connection...');

        // Try to write a test document
        const testDoc = await db.collection('test').doc('test').set({
            test: true,
            timestamp: new Date()
        });
        console.log('✅ Successfully wrote to Firestore');

        // Try to read the test document
        const doc = await db.collection('test').doc('test').get();
        console.log('📄 Test document data:', doc.data());

        // Clean up
        await db.collection('test').doc('test').delete();
        console.log('🧹 Cleaned up test document');

        console.log('✅ Firestore test completed successfully');
    } catch (error) {
        console.error('❌ Error testing Firestore:', error);
        throw error;
    }
}

testFirestore();
