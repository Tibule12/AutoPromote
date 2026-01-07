const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { db, admin } = require("../firebaseAdmin");

// Get all content pending approval
router.get("/pending", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { limit = 50, offset = 0, type } = req.query;

    let query = db.collection("content").where("approvalStatus", "==", "pending");

    if (type) {
      query = query.where("type", "==", type);
    }

    const snapshot = await query
      .orderBy("createdAt", "desc")
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get();

    const content = [];
    for (const doc of snapshot.docs) {
      const contentData = doc.data();

      // Get user info
      let userData = null;
      if (contentData.userId) {
        const userDoc = await db.collection("users").doc(contentData.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: contentData.userId,
            name: user.name,
            email: user.email,
            plan: user.plan,
          };
        }
      }

      content.push({
        id: doc.id,
        ...contentData,
        user: userData,
        createdAt: contentData.createdAt?.toDate?.() || contentData.createdAt,
      });
    }

    res.json({ success: true, content, total: content.length });
  } catch (error) {
    console.error("Error fetching pending content:", error.message || error);
    if (error && error.message && error.message.includes("requires an index")) {
      // Parse the message to find the console link
      const linkMatch = (error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/) || [
        null,
      ])[0];
      return res.status(422).json({
        success: false,
        error: "Missing Firestore composite index required by this query",
        indexLink: linkMatch || null,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve content
router.post("/:contentId/approve", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { notes } = req.body;

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    await contentRef.update({
      approvalStatus: "approved",
      approvedBy: req.user.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalNotes: notes || null,
      status: "active",
    });

    // Notify user
    const content = contentDoc.data();
    if (content.userId) {
      await db.collection("notifications").add({
        userId: content.userId,
        type: "content_approved",
        contentId,
        message: "Your content has been approved and is now live!",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log action
    await db.collection("audit_logs").add({
      action: "approve_content",
      adminId: req.user.uid,
      contentId,
      notes,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Content approved successfully" });
  } catch (error) {
    console.error("Error approving content:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject content
router.post("/:contentId/reject", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, error: "Rejection reason required" });
    }

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    await contentRef.update({
      approvalStatus: "rejected",
      rejectedBy: req.user.uid,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: reason,
      status: "rejected",
    });

    // Notify user
    const content = contentDoc.data();
    if (content.userId) {
      await db.collection("notifications").add({
        userId: content.userId,
        type: "content_rejected",
        contentId,
        message: `Your content was rejected: ${reason}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log action
    await db.collection("audit_logs").add({
      action: "reject_content",
      adminId: req.user.uid,
      contentId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Content rejected successfully" });
  } catch (error) {
    console.error("Error rejecting content:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request changes
router.post("/:contentId/request-changes", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { changes } = req.body;

    if (!changes) {
      return res.status(400).json({ success: false, error: "Change requests required" });
    }

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    await contentRef.update({
      approvalStatus: "changes_requested",
      changesRequestedBy: req.user.uid,
      changesRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      requestedChanges: changes,
    });

    // Notify user
    const content = contentDoc.data();
    if (content.userId) {
      await db.collection("notifications").add({
        userId: content.userId,
        type: "changes_requested",
        contentId,
        message: `Changes requested for your content: ${changes}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log action
    await db.collection("audit_logs").add({
      action: "request_content_changes",
      adminId: req.user.uid,
      contentId,
      changes,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Change request sent successfully" });
  } catch (error) {
    console.error("Error requesting changes:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk approve
router.post("/bulk-approve", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { contentIds } = req.body;

    if (!contentIds || !Array.isArray(contentIds)) {
      return res.status(400).json({ success: false, error: "Invalid content IDs" });
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const contentId of contentIds) {
      const contentRef = db.collection("content").doc(contentId);
      batch.update(contentRef, {
        approvalStatus: "approved",
        approvedBy: req.user.uid,
        approvedAt: timestamp,
        status: "active",
      });
    }

    await batch.commit();

    // Log bulk action
    await db.collection("audit_logs").add({
      action: "bulk_approve_content",
      adminId: req.user.uid,
      contentIds,
      count: contentIds.length,
      timestamp,
    });

    res.json({
      success: true,
      message: `${contentIds.length} items approved`,
      count: contentIds.length,
    });
  } catch (error) {
    console.error("Error bulk approving:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get approval statistics
router.get("/stats", authMiddleware, adminOnly, async (req, res) => {
  try {
    const [pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
      db.collection("content").where("approvalStatus", "==", "pending").get(),
      db.collection("content").where("approvalStatus", "==", "approved").get(),
      db.collection("content").where("approvalStatus", "==", "rejected").get(),
    ]);

    // Get today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    const [approvedTodaySnapshot, rejectedTodaySnapshot] = await Promise.all([
      db
        .collection("content")
        .where("approvalStatus", "==", "approved")
        .where("approvedAt", ">=", todayTimestamp)
        .get(),
      db
        .collection("content")
        .where("approvalStatus", "==", "rejected")
        .where("rejectedAt", ">=", todayTimestamp)
        .get(),
    ]);

    res.json({
      success: true,
      stats: {
        pending: pendingSnapshot.size,
        approved: approvedSnapshot.size,
        rejected: rejectedSnapshot.size,
        approvedToday: approvedTodaySnapshot.size,
        rejectedToday: rejectedTodaySnapshot.size,
      },
    });
  } catch (error) {
    console.error("Error fetching approval stats:", error.message || error);
    if (error && error.message && error.message.includes("requires an index")) {
      const linkMatch = (error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/) || [
        null,
      ])[0];
      // Return a graceful fallback so the admin UI does not break in production
      return res.status(200).json({
        success: true,
        stats: {
          pending: 0,
          approved: 0,
          rejected: 0,
          approvedToday: 0,
          rejectedToday: 0,
        },
        warning: "missing_index",
        indexLink: linkMatch || null,
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-moderation scan (NSFW/harmful content detection)
router.post("/:contentId/scan", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    // eslint-disable-next-line no-unused-vars -- placeholder for future use
    const _content = contentDoc.data();

    // Simulate content scanning (integrate with OpenAI Moderation API or similar)
    const scanResults = {
      safe: true,
      categories: {
        nsfw: 0.01,
        violence: 0.02,
        hate: 0.01,
        harassment: 0.01,
      },
      confidence: 0.95,
      scannedAt: new Date().toISOString(),
    };

    // Auto-flag if any category > 0.5
    const flagged = Object.values(scanResults.categories).some(score => score > 0.5);

    await contentRef.update({
      moderationScan: scanResults,
      autoFlagged: flagged,
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (flagged) {
      await contentRef.update({
        approvalStatus: "flagged",
        status: "under_review",
      });
    }

    // Log scan
    await db.collection("audit_logs").add({
      action: "scan_content",
      adminId: req.user.uid,
      contentId,
      results: scanResults,
      flagged,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, scanResults, flagged });
  } catch (error) {
    console.error("Error scanning content:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
