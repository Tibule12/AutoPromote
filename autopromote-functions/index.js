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
                // Set your own logic for endTime, e.g., 7 days from now
                endTime: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                ),
                createdAt: admin.firestore.Timestamp.now()
                // Add any other fields you need
            };

            // Create a new promotion schedule
            await admin
                .firestore()
                .collection("promotion_schedules")
                .add(promotionData);

            console.log(
                `Promotion schedule created for content: ${contentId}`
            );
        }
        return null;
    });