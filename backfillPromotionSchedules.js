// backfillPromotionSchedules.js
// Run this script with Node.js after setting up Firebase Admin SDK credentials

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Update path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfillPromotionSchedules() {
  const snapshot = await db.collection('content').where('status', '==', 'approved').get();
  if (snapshot.empty) {
    console.log('No approved content found.');
    return;
  }
  for (const doc of snapshot.docs) {
    const contentId = doc.id;
    // Check if a promotion schedule already exists for this content
    const existing = await db.collection('promotion_schedules').where('contentId', '==', contentId).get();
    if (!existing.empty) {
      console.log(`Promotion schedule already exists for content: ${contentId}`);
      continue;
    }
    const promotionData = {
      contentId,
      isActive: true,
      startTime: admin.firestore.Timestamp.now(),
      endTime: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      createdAt: admin.firestore.Timestamp.now()
    };
    await db.collection('promotion_schedules').add(promotionData);
    console.log(`Promotion schedule created for content: ${contentId}`);
  }
  console.log('Backfill complete.');
}

backfillPromotionSchedules().catch(console.error);
