const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

const region = 'us-central1';

exports.createPromotionOnApproval = functions.region(region).firestore
  .document("content/{contentId}")
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();

      // Only trigger if status changed to 'approved'
      if (before.status !== "approved" && after.status === "approved") {
        const contentId = context.params.contentId;
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now()
        };
        await admin
          .firestore()
          .collection("promotion_schedules")
          .add(promotionData);
        console.log(
          `Promotion schedule created for content (onUpdate): ${contentId}`
        );
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnApproval:", error);
      return null;
    }
  });

exports.createPromotionOnContentCreate = functions.region(region).firestore
  .document("content/{contentId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      if (data.status === "approved") {
        const contentId = context.params.contentId;
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now()
        };
        await admin
          .firestore()
          .collection("promotion_schedules")
          .add(promotionData);
        console.log(
          `Promotion schedule created for content (onCreate): ${contentId}`
        );
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnContentCreate:", error);
      return null;
    }
  });