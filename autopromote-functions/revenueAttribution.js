const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const region = "us-central1";

// Revenue Attribution System
// Call this function from landing page JS or affiliate link redirect
exports.logMonetizationEvent = functions.region(region).https.onCall(async (data, context) => {
  // data: { contentId, userId, eventType, value, referrerId }
  // eventType: 'ad_impression', 'ad_click', 'affiliate_click', 'affiliate_conversion'
  const { contentId, userId, eventType, value, referrerId } = data;
  if (!contentId || !userId || !eventType) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "contentId, userId, and eventType are required"
    );
  }
  try {
    // Log event in analytics
    await admin
      .firestore()
      .collection("analytics")
      .add({
        type: eventType,
        contentId,
        userId,
        value: value || 0,
        referrerId: referrerId || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    // Update revenue per content
    const revenueField =
      eventType === "ad_click" || eventType === "affiliate_conversion" ? "revenue" : null;
    if (revenueField && value) {
      await admin
        .firestore()
        .collection("content")
        .doc(contentId)
        .update({
          revenue: admin.firestore.FieldValue.increment(value),
        });
      await admin
        .firestore()
        .collection("revenue")
        .doc(contentId)
        .set(
          {
            contentId,
            userId,
            totalRevenue: admin.firestore.FieldValue.increment(value),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
    return { success: true };
  } catch (error) {
    console.error("Error logging monetization event:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// Aggregate revenue for a user or platform
exports.getRevenueSummary = functions.region(region).https.onCall(async (data, context) => {
  // data: { userId }
  const { userId } = data;
  try {
    let query = admin.firestore().collection("revenue");
    if (userId) query = query.where("userId", "==", userId);
    const snapshot = await query.get();
    let total = 0;
    snapshot.forEach(doc => {
      total += doc.data().totalRevenue || 0;
    });
    return { totalRevenue: total };
  } catch (error) {
    console.error("Error getting revenue summary:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
