const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { db, admin } = require("../firebaseAdmin");

// Get all support tickets
router.get("/tickets", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, priority, limit = 50 } = req.query;

    let query = db.collection("support_tickets");

    if (status) {
      query = query.where("status", "==", status);
    }

    if (priority) {
      query = query.where("priority", "==", priority);
    }

    const snapshot = await query.orderBy("createdAt", "desc").limit(parseInt(limit)).get();

    const tickets = [];
    for (const doc of snapshot.docs) {
      const ticketData = doc.data();

      // Get user info
      let userData = null;
      if (ticketData.userId) {
        const userDoc = await db.collection("users").doc(ticketData.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: ticketData.userId,
            name: user.name,
            email: user.email,
          };
        }
      }

      tickets.push({
        id: doc.id,
        ...ticketData,
        user: userData,
        createdAt: ticketData.createdAt?.toDate?.() || ticketData.createdAt,
      });
    }

    res.json({ success: true, tickets });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create support ticket
router.post("/tickets", authMiddleware, async (req, res) => {
  try {
    const { subject, description, priority, category } = req.body;

    const ticketData = {
      userId: req.user.uid,
      subject,
      description,
      priority: priority || "medium",
      category: category || "general",
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ticketRef = await db.collection("support_tickets").add(ticketData);

    res.json({ success: true, ticketId: ticketRef.id });
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update ticket status
router.patch("/tickets/:ticketId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, assignedTo, response } = req.body;

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status) updateData.status = status;
    if (assignedTo) updateData.assignedTo = assignedTo;

    await db.collection("support_tickets").doc(ticketId).update(updateData);

    // Add response if provided
    if (response) {
      await db.collection("support_tickets").doc(ticketId).collection("responses").add({
        adminId: req.user.uid,
        message: response,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log action
    await db.collection("audit_logs").add({
      action: "update_ticket",
      adminId: req.user.uid,
      ticketId,
      changes: updateData,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Ticket updated successfully" });
  } catch (error) {
    console.error("Error updating ticket:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send bulk message to users
router.post("/bulk-message", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { subject, message, targetAudience, userIds } = req.body;

    // targetAudience: 'all', 'active', 'inactive', 'premium', 'free', 'specific'

    let users = [];

    if (targetAudience === "specific" && userIds) {
      users = userIds;
    } else {
      let query = db.collection("users");

      if (targetAudience === "premium") {
        query = query.where("plan", "in", ["premium", "pro"]);
      } else if (targetAudience === "free") {
        query = query.where("plan", "==", "free");
      } else if (targetAudience === "active") {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        query = query.where("lastActive", ">=", admin.firestore.Timestamp.fromDate(weekAgo));
      }

      const snapshot = await query.get();
      users = snapshot.docs.map(doc => doc.id);
    }

    // Create notification records
    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    users.forEach(userId => {
      const notificationRef = db.collection("notifications").doc();
      batch.set(notificationRef, {
        userId,
        type: "admin_message",
        subject,
        message,
        read: false,
        createdAt: timestamp,
      });
    });

    await batch.commit();

    // Log the bulk message
    await db.collection("audit_logs").add({
      action: "send_bulk_message",
      adminId: req.user.uid,
      targetAudience,
      recipientCount: users.length,
      subject,
      timestamp,
    });

    res.json({
      success: true,
      message: "Bulk message sent successfully",
      recipientCount: users.length,
    });
  } catch (error) {
    console.error("Error sending bulk message:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user impersonation token (for debugging)
router.post("/impersonate/:userId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Log the impersonation attempt
    await db.collection("audit_logs").add({
      action: "impersonate_user",
      adminId: req.user.uid,
      targetUserId: userId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate a custom token for the user
    const customToken = await admin.auth().createCustomToken(userId);

    res.json({
      success: true,
      customToken,
      warning: "Use this token responsibly for debugging purposes only",
    });
  } catch (error) {
    console.error("Error generating impersonation token:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user churn analysis
router.get("/churn-analysis", authMiddleware, adminOnly, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get users who haven't been active in 30+ days
    const inactiveUsersSnapshot = await db
      .collection("users")
      .where("lastActive", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    // Get users at risk (active 30-60 days ago but not recently)
    const atRiskUsersSnapshot = await db
      .collection("users")
      .where("lastActive", ">=", admin.firestore.Timestamp.fromDate(sixtyDaysAgo))
      .where("lastActive", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    const inactiveUsers = inactiveUsersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    const atRiskUsers = atRiskUsersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      churnAnalysis: {
        inactiveCount: inactiveUsers.length,
        atRiskCount: atRiskUsers.length,
        inactiveUsers: inactiveUsers.slice(0, 20),
        atRiskUsers: atRiskUsers.slice(0, 20),
      },
    });
  } catch (error) {
    console.error("Error fetching churn analysis:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send re-engagement campaign
router.post("/re-engage", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userIds, message, incentive } = req.body;

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    userIds.forEach(userId => {
      const notificationRef = db.collection("notifications").doc();
      batch.set(notificationRef, {
        userId,
        type: "re_engagement",
        message,
        incentive,
        read: false,
        createdAt: timestamp,
      });
    });

    await batch.commit();

    // Log the campaign
    await db.collection("audit_logs").add({
      action: "send_re_engagement",
      adminId: req.user.uid,
      userCount: userIds.length,
      incentive,
      timestamp,
    });

    res.json({
      success: true,
      message: "Re-engagement campaign sent",
      recipientCount: userIds.length,
    });
  } catch (error) {
    console.error("Error sending re-engagement:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
