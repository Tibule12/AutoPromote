const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const region = "us-central1";

// Add referrerId to content metadata
exports.addReferrerToContent = functions.region(region).https.onCall(async (data, context) => {
  // data: { contentId, referrerId }
  const { contentId, referrerId } = data;
  if (!contentId || !referrerId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "contentId and referrerId are required"
    );
  }
  try {
    await admin.firestore().collection("content").doc(contentId).update({ referrerId });
    return { success: true };
  } catch (error) {
    console.error("Error adding referrerId to content:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// Track traffic and revenue per referrer
exports.getReferralStats = functions.region(region).https.onCall(async (data, context) => {
  // data: { referrerId }
  const { referrerId } = data;
  if (!referrerId) {
    throw new functions.https.HttpsError("invalid-argument", "referrerId is required");
  }
  try {
    // Get all content referred by this referrer
    const contentSnapshot = await admin
      .firestore()
      .collection("content")
      .where("referrerId", "==", referrerId)
      .get();
    const contentIds = contentSnapshot.docs.map(doc => doc.id);
    // Get analytics events for these contentIds
    let totalTraffic = 0;
    let totalRevenue = 0;
    if (contentIds.length > 0) {
      const analyticsSnapshot = await admin
        .firestore()
        .collection("analytics")
        .where("contentId", "in", contentIds.slice(0, 10))
        .get();
      analyticsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === "smart_link_click") totalTraffic++;
        if ((data.type === "ad_click" || data.type === "affiliate_conversion") && data.value)
          totalRevenue += data.value;
      });
    }
    return { totalTraffic, totalRevenue };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
