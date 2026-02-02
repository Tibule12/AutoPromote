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

    let snapshot = await query
      .orderBy("createdAt", "desc")
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get();

    // Fallback for older documents that use snake_case fields (`created_at`)
    if (!snapshot || snapshot.empty) {
      try {
        snapshot = await query
          .orderBy("created_at", "desc")
          .limit(parseInt(limit))
          .offset(parseInt(offset))
          .get();
      } catch (e) {
        // If this also fails (no index or other), ignore and continue with empty results
      }
    }

    const content = [];
    for (const doc of snapshot.docs) {
      const contentData = doc.data();

      // Get user info
      let userData = null;
      const userIdForLookup = contentData.userId || contentData.user_id;
      if (userIdForLookup) {
        const userDoc = await db.collection("users").doc(userIdForLookup).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: userIdForLookup,
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
        // Support both camelCase and snake_case timestamp fields
        createdAt: contentData.createdAt?.toDate?.()
          ? contentData.createdAt.toDate()
          : contentData.createdAt ||
            (contentData.created_at?.toDate?.()
              ? contentData.created_at.toDate()
              : contentData.created_at),
      });
    }

    // If debug flag present, include additional diagnostic info (counts & recent docs)
    if (String(req.query.debug || "").toLowerCase() === "1") {
      try {
        const statuses = ["pending", "approved", "rejected", "flagged", "changes_requested"];
        const counts = {};
        await Promise.all(
          statuses.map(async s => {
            try {
              const snap = await db.collection("content").where("approvalStatus", "==", s).get();
              counts[s] = snap.size;
            } catch (e) {
              counts[s] = null;
            }
          })
        );

        const recentSnap = await db
          .collection("content")
          .orderBy("created_at", "desc")
          .limit(20)
          .get()
          .catch(() => ({ docs: [] }));
        const recent = (recentSnap.docs || []).map(d => ({
          id: d.id,
          approvalStatus: d.data().approvalStatus,
          title: d.data().title,
          user_id: d.data().user_id,
          created_at: d.data().created_at,
        }));

        const recentPendingSnap = await db
          .collection("content")
          .where("approvalStatus", "==", "pending")
          .orderBy("created_at", "desc")
          .limit(20)
          .get()
          .catch(() => ({ docs: [] }));
        const recentPending = (recentPendingSnap.docs || []).map(d => ({
          id: d.id,
          approvalStatus: d.data().approvalStatus,
          title: d.data().title,
          user_id: d.data().user_id,
          created_at: d.data().created_at,
        }));

        return res.json({
          success: true,
          content,
          total: content.length,
          debug: { counts, recent, recentPending },
        });
      } catch (err) {
        console.error(
          "[admin/pending][debug] Failed to gather debug info:",
          err && err.stack ? err.stack : err
        );
        // Fall through to return the normal response below
      }
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
      status: "approved",
    });

    // Notify user
    const content = contentDoc.data();
    if (content.userId) {
      const msg = notes
        ? `Your content has been approved and is now live! Admin note: ${notes}`
        : "Your content has been approved and is now live!";
      await db.collection("notifications").add({
        userId: content.userId,
        type: "content_approved",
        contentId,
        message: msg,
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

    // Auto-enqueue platform posts for this content based on its target_platforms
    (async () => {
      try {
        const c = await contentRef.get();
        if (c.exists) {
          const data = c.data() || {};
          const targets = Array.isArray(data.target_platforms)
            ? data.target_platforms
            : Array.isArray(data.platforms)
              ? data.platforms
              : [];
          if (targets.length) {
            const { enqueuePlatformPostTask } = require("../services/promotionTaskQueue");
            for (const platform of targets) {
              try {
                // Honor sponsor approval for sponsored posts
                const options = (data.platformOptions && data.platformOptions[platform]) || {};
                const role = String(options.role || "").toLowerCase();
                if (role === "sponsored") {
                  const sponsorApproval = options.sponsorApproval || (data.platform_options && data.platform_options[platform] && data.platform_options[platform].sponsorApproval) || null;
                  if (!sponsorApproval || sponsorApproval.status !== "approved") {
                    console.warn("Skipping enqueue: sponsor approval missing or not approved for", contentId, platform);
                    // Record audit log about skip
                    await db.collection("audit_logs").add({
                      action: "skip_enqueue_sponsor_not_approved",
                      adminId: req.user.uid,
                      contentId,
                      platform,
                      timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    // Notify uploader that sponsor approval is pending
                    if (data.userId) {
                      await db.collection("notifications").add({
                        userId: data.userId,
                        type: "sponsor_pending",
                        contentId,
                        platform,
                        message: `Your sponsored post for ${platform} is pending sponsor approval and will not be published until an admin approves the sponsor.`,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                      });
                    }
                    continue; // skip this platform
                  }
                }

                const pPayload = {
                  url: data.url,
                  title: data.title,
                  description: data.description,
                  platformOptions: data.platformOptions || {},
                  hashtags: data.hashtags || [],
                };
                // For TikTok, default approved publishes to PUBLIC
                if (platform === "tiktok") {
                  if (!pPayload.privacy) pPayload.privacy = "PUBLIC_TO_EVERYONE";
                  // helpful flag for consumers
                  pPayload.platformOptions = pPayload.platformOptions || {};
                  pPayload.platformOptions.tiktok = pPayload.platformOptions.tiktok || {};
                  pPayload.platformOptions.tiktok.approved_publish = true;
                }
                await enqueuePlatformPostTask({
                  contentId,
                  uid: data.userId || null,
                  platform,
                  reason: "approved",
                  payload: pPayload,
                });
              } catch (e) {
                console.warn("enqueuePlatformPostTask failed for", contentId, platform, e.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn("auto-enqueue after approval failed:", err.message || err);
      }
    })();

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
        status: "approved",
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

    // Auto-enqueue platform posts for each approved content (best-effort, async)
    (async () => {
      try {
        const { enqueuePlatformPostTask } = require("../services/promotionTaskQueue");
        for (const cid of contentIds) {
          try {
            const cSnap = await db.collection("content").doc(cid).get();
            if (!cSnap.exists) continue;
            const data = cSnap.data() || {};
            const targets = Array.isArray(data.target_platforms)
              ? data.target_platforms
              : Array.isArray(data.platforms)
                ? data.platforms
                : [];
            for (const platform of targets) {
              try {
                await enqueuePlatformPostTask({
                  contentId: cid,
                  uid: data.userId || null,
                  platform,
                  reason: "approved",
                  payload: {
                    url: data.url,
                    title: data.title,
                    description: data.description,
                    platformOptions: data.platformOptions || {},
                    hashtags: data.hashtags || [],
                  },
                });
              } catch (e) {
                console.warn("bulk enqueue failed for", cid, platform, e && e.message);
              }
            }
          } catch (e) {
            console.warn("bulk enqueue content fetch failed for", cid, e && e.message);
          }
        }
      } catch (err) {
        console.warn("bulk auto-enqueue failed:", err && err.message);
      }
    })();

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

    // Use single-field queries and filter in-memory to avoid requiring a composite index
    const [approvedAtSnap, rejectedAtSnap] = await Promise.all([
      db
        .collection("content")
        .where("approvedAt", ">=", todayTimestamp)
        .get()
        .catch(() => ({ docs: [] })),
      db
        .collection("content")
        .where("rejectedAt", ">=", todayTimestamp)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const approvedTodaySnapshot = {
      size: (approvedAtSnap.docs || []).filter(d => d.data().approvalStatus === "approved").length,
    };
    const rejectedTodaySnapshot = {
      size: (rejectedAtSnap.docs || []).filter(d => d.data().approvalStatus === "rejected").length,
    };

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

// Quick debug endpoint to inspect recent approval activity and recent approved/pending content
router.get("/debug", authMiddleware, adminOnly, async (req, res) => {
  try {
    // Last 50 approval audit logs
    const logsSnap = await db
      .collection("audit_logs")
      .where("action", "==", "approve_content")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    const approvals = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Recent approved and pending content (last 50 each)
    const [approvedSnap, pendingSnap] = await Promise.all([
      db
        .collection("content")
        .where("approvalStatus", "==", "approved")
        .orderBy("approvedAt", "desc")
        .limit(50)
        .get()
        .catch(() => ({ docs: [] })),
      db
        .collection("content")
        .where("approvalStatus", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const approved = approvedSnap.docs
      ? approvedSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      : [];
    const pending = pendingSnap.docs ? pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

    res.json({ success: true, approvals, approved, pending });
  } catch (err) {
    console.error(
      "[admin/debug] Error fetching approval debug data:",
      err && err.stack ? err.stack : err
    );
    res.status(500).json({ success: false, error: "Failed to fetch debug info" });
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
