const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
try {
  // Try to find service account key
  const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Fallback to default credentials or mock if running in certain envs
    // checking if we can use existing app
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
  process.exit(1);
}

const db = admin.firestore();

async function clearFailedSchedules() {
  try {
    console.log('Starting cleanup of failed entries for Facebook and YouTube...');
    
    // 1. Clear Facebook
    const fbSnapshot = await db.collection('promotion_schedules')
      .where('status', '==', 'failed')
      .where('platform', '==', 'facebook')
      .get();
    
    console.log(`Found ${fbSnapshot.size} failed schedules for facebook`);
    
    // 2. Clear YouTube
    const ytSnapshot = await db.collection('promotion_schedules')
      .where('status', '==', 'failed')
      .where('platform', '==', 'youtube')
      .get();
      
    console.log(`Found ${ytSnapshot.size} failed schedules for youtube`);

    const batch = db.batch();
    let batchCount = 0;
    let totalDeleted = 0;

    // Process Facebook
    fbSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      batchCount++;
      totalDeleted++;
    });

    // Process YouTube
    ytSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        batchCount++;
        totalDeleted++;
      });

    if (batchCount > 0) {
      await batch.commit();
      console.log(`Successfully cleared ${totalDeleted} failed schedules.`);
    } else {
      console.log('No failed schedules found to clear.');
    }

  } catch (error) {
    console.error('Error clearing schedules:', error);
  } finally {
    process.exit(0);
  }
}

clearFailedSchedules();
