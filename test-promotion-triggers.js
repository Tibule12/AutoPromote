const { admin, db } = require("./firebaseAdmin");

async function testPromotionTriggers() {
  try {
    console.log("Testing Promotion Trigger Functions...");

    // Test createPromotionOnApproval
    console.log("1. Testing createPromotionOnApproval...");

    const contentId1 = `test-content-approval-${Date.now()}`;
    await db.collection("content").doc(contentId1).set({
      title: "Test Content for Approval",
      type: "video",
      url: "https://example.com/video.mp4",
      user_id: "test-user-id",
      status: "pending", // Initially pending
    });

    // Simulate status change to approved (this would trigger the function)
    await db.collection("content").doc(contentId1).update({
      status: "approved",
    });

    // Check if promotion schedule was created
    const schedulesSnapshot = await db
      .collection("promotion_schedules")
      .where("contentId", "==", contentId1)
      .get();

    if (!schedulesSnapshot.empty) {
      console.log("✓ createPromotionOnApproval: promotion schedule created on approval");
    } else {
      console.log("✗ createPromotionOnApproval: promotion schedule not created");
    }

    // Test createPromotionOnContentCreate
    console.log("2. Testing createPromotionOnContentCreate...");

    const contentId2 = `test-content-create-${Date.now()}`;
    await db.collection("content").doc(contentId2).set({
      title: "Test Content Created Approved",
      type: "video",
      url: "https://example.com/video2.mp4",
      user_id: "test-user-id",
      status: "approved", // Already approved on create
    });

    // Check if promotion schedule was created on create
    const schedulesSnapshot2 = await db
      .collection("promotion_schedules")
      .where("contentId", "==", contentId2)
      .get();

    if (!schedulesSnapshot2.empty) {
      console.log(
        "✓ createPromotionOnContentCreate: promotion schedule created on content creation"
      );
    } else {
      console.log("✗ createPromotionOnContentCreate: promotion schedule not created");
    }

    // Test with non-approved content
    console.log("3. Testing with non-approved content...");

    const contentId3 = `test-content-pending-${Date.now()}`;
    await db.collection("content").doc(contentId3).set({
      title: "Test Content Still Pending",
      type: "video",
      url: "https://example.com/video3.mp4",
      user_id: "test-user-id",
      status: "pending", // Still pending
    });

    // Check that no promotion schedule was created
    const schedulesSnapshot3 = await db
      .collection("promotion_schedules")
      .where("contentId", "==", contentId3)
      .get();

    if (schedulesSnapshot3.empty) {
      console.log("✓ Promotion triggers correctly skip non-approved content");
    } else {
      console.log("✗ Promotion triggers incorrectly created schedule for non-approved content");
    }

    console.log("Promotion Trigger Functions tests completed successfully");
  } catch (error) {
    console.error("Error testing promotion triggers:", error);
  }
}

testPromotionTriggers();
