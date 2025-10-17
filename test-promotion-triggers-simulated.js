const { admin, db } = require('./firebaseAdmin');

// Simulate the trigger logic from autopromote-functions/index.js
async function simulateCreatePromotionOnApproval(change, context) {
  try {
    const before = change.before.data();
    const after = change.after.data();
    const contentId = context.params.contentId;
    console.log(`Simulating createPromotionOnApproval for contentId: ${contentId}`);
    console.log('Before status:', before.status, 'After status:', after.status);
    // Only trigger if status changed to 'approved'
    if (before.status !== "approved" && after.status === "approved") {
      const promotionData = {
        contentId,
        isActive: true,
        startTime: admin.firestore.Timestamp.now(),
        endTime: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ),
        createdAt: admin.firestore.Timestamp.now()
      };
      await admin.firestore().collection("promotion_schedules").add(promotionData);
      console.log(`Promotion schedule created for content (onUpdate): ${contentId}`);
      return true;
    } else {
      console.log('Status did not change to approved, no promotion created.');
      return false;
    }
  } catch (error) {
    console.error("Error in simulated createPromotionOnApproval:", error);
    return false;
  }
}

async function simulateCreatePromotionOnContentCreate(snap, context) {
  try {
    const data = snap.data();
    const contentId = context.params.contentId;
    console.log(`Simulating createPromotionOnContentCreate for contentId: ${contentId}`);
    console.log('Document status:', data.status);
    if (data.status === "approved") {
      const promotionData = {
        contentId,
        isActive: true,
        startTime: admin.firestore.Timestamp.now(),
        endTime: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ),
        createdAt: admin.firestore.Timestamp.now()
      };
      await admin.firestore().collection("promotion_schedules").add(promotionData);
      console.log(`Promotion schedule created for content (onCreate): ${contentId}`);
      return true;
    } else {
      console.log('Document status is not approved, no promotion created.');
      return false;
    }
  } catch (error) {
    console.error("Error in simulated createPromotionOnContentCreate:", error);
    return false;
  }
}

async function testPromotionTriggersSimulated() {
  try {
    console.log('Testing Promotion Trigger Functions (Simulated)...');

    // Test createPromotionOnApproval
    console.log('1. Testing createPromotionOnApproval simulation...');

    const contentId1 = `test-content-approval-${Date.now()}`;
    const contentRef1 = db.collection('content').doc(contentId1);

    // Create initial document with pending status
    await contentRef1.set({
      title: 'Test Content for Approval',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: 'test-user-id',
      status: 'pending'
    });

    // Simulate the change object
    const beforeSnap1 = {
      data: () => ({ status: 'pending' })
    };
    const afterSnap1 = {
      data: () => ({ status: 'approved' })
    };
    const change1 = {
      before: beforeSnap1,
      after: afterSnap1
    };
    const context1 = { params: { contentId: contentId1 } };

    const result1 = await simulateCreatePromotionOnApproval(change1, context1);

    if (result1) {
      console.log('✓ createPromotionOnApproval: promotion schedule created on approval');
    } else {
      console.log('✗ createPromotionOnApproval: promotion schedule not created');
    }

    // Test createPromotionOnContentCreate
    console.log('2. Testing createPromotionOnContentCreate simulation...');

    const contentId2 = `test-content-create-${Date.now()}`;
    const contentRef2 = db.collection('content').doc(contentId2);

    // Create document with approved status
    await contentRef2.set({
      title: 'Test Content Created Approved',
      type: 'video',
      url: 'https://example.com/video2.mp4',
      user_id: 'test-user-id',
      status: 'approved'
    });

    // Simulate the snapshot object
    const snap2 = {
      data: () => ({ status: 'approved' })
    };
    const context2 = { params: { contentId: contentId2 } };

    const result2 = await simulateCreatePromotionOnContentCreate(snap2, context2);

    if (result2) {
      console.log('✓ createPromotionOnContentCreate: promotion schedule created on content creation');
    } else {
      console.log('✗ createPromotionOnContentCreate: promotion schedule not created');
    }

    // Test with non-approved content
    console.log('3. Testing with non-approved content...');

    const contentId3 = `test-content-pending-${Date.now()}`;
    const contentRef3 = db.collection('content').doc(contentId3);

    await contentRef3.set({
      title: 'Test Content Still Pending',
      type: 'video',
      url: 'https://example.com/video3.mp4',
      user_id: 'test-user-id',
      status: 'pending'
    });

    // Simulate for createPromotionOnContentCreate
    const snap3 = {
      data: () => ({ status: 'pending' })
    };
    const context3 = { params: { contentId: contentId3 } };

    const result3 = await simulateCreatePromotionOnContentCreate(snap3, context3);

    if (!result3) {
      console.log('✓ Promotion triggers correctly skip non-approved content');
    } else {
      console.log('✗ Promotion triggers incorrectly created schedule for non-approved content');
    }

    // Verify promotion schedules were actually created
    console.log('4. Verifying promotion schedules...');
    const schedulesSnapshot = await db.collection('promotion_schedules').get();
    console.log(`Total promotion schedules created: ${schedulesSnapshot.size}`);

    schedulesSnapshot.forEach(doc => {
      console.log(`- Schedule for contentId: ${doc.data().contentId}, isActive: ${doc.data().isActive}`);
    });

    console.log('Promotion Trigger Functions (Simulated) tests completed successfully');

  } catch (error) {
    console.error('Error testing promotion triggers:', error);
  }
}

testPromotionTriggersSimulated();
