// BUSINESS RULE: Revenue per 1M views is $900,000. Creator gets 5% of revenue. Target views: 2M/day.
// Creator payout per 2M views: 2 * $900,000 * 0.05 = $90,000
// BUSINESS RULE: Content must be auto-removed after 2 days of upload.
// In production, implement a scheduled job (e.g., with Firebase Cloud Functions or Cloud Scheduler)
// to delete or archive content where created_at is older than 2 days.

// Example (using Firebase Cloud Functions):
// exports.cleanupOldContent = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
//   const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
//   const snapshot = await db.collection('content')
//     .where('created_at', '<', twoDaysAgo)
//     .get();
//   
//   const batch = db.batch();
//   snapshot.docs.forEach((doc) => {
//     batch.delete(doc.ref);
//   });
//   
//   await batch.commit();
// });

const express = require('express');
const { db } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const {
  validateContentData,
  validateAnalyticsData,
  validatePromotionData,
  validateRateLimit,
  sanitizeInput
} = require('./validationMiddleware');
const promotionService = require('./promotionService');
const optimizationService = require('./optimizationService');
const router = express.Router();

// Helper function to check if user can upload (rate limiting)
const canUserUpload = async (userId, daysAgo = 21) => {
  const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  try {
    const snapshot = await db.collection('content')
      .where('user_id', '==', userId)
      .where('created_at', '>=', cutoffDate)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      // No recent content, can upload
      return { canUpload: true, reason: null };
    }

    const mostRecentContent = snapshot.docs[0].data();
    const createdAt = mostRecentContent.created_at;

    // If created_at is a Firestore Timestamp, convert to Date
    const createdDate = createdAt && createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const daysSinceUpload = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpload < daysAgo) {
      return {
        canUpload: false,
        reason: `You can only upload once every ${daysAgo} days. Last upload was ${daysSinceUpload.toFixed(1)} days ago.`
      };
    }

    return { canUpload: true, reason: null };
  } catch (error) {
    return { canUpload: false, reason: 'Error checking upload eligibility.' };
  }
};
