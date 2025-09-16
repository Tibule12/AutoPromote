const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

exports.createPromotionOnApproval = functions.firestore
    .document("content/{contentId}")
    .onUpdate(async (change, context) => {
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
    });

// Also create promotion schedule when content is created and status is approved
exports.createPromotionOnContentCreate = functions.firestore
    .document("content/{contentId}")
    .onCreate(async (snap, context) => {
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
    });