const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { db, admin } = require("../firebaseAdmin");

// List pending sponsor approvals
router.get("/pending", authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const snap = await db
      .collection("sponsor_approvals")
      .where("status", "==", "pending")
      .orderBy("requestedAt", "desc")
      .limit(limit)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const out = [];
    for (const d of snap.docs) {
      const v = d.data();
      const contentDoc = await db.collection("content").doc(v.contentId).get();
      out.push({
        id: d.id,
        ...v,
        content: contentDoc.exists ? { id: contentDoc.id, ...contentDoc.data() } : null,
      });
    }
    res.json({ success: true, items: out, total: out.length });
  } catch (e) {
    console.error("Error fetching pending sponsor approvals:", e && e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Approve sponsor
router.post("/:id/approve", authMiddleware, adminOnly, async (req, res) => {
  try {
    console.log(
      "[adminSponsorApproval] approve handler called for",
      req.params && req.params.id,
      "by",
      req.user && req.user.uid
    );
    const { id } = req.params;
    const { notes } = req.body || {};
    const snap = await db.collection("sponsor_approvals").doc(id).get();
    console.log("[adminSponsorApproval] sponsor_approval snap fetched");
    if (!snap.exists) return res.status(404).json({ success: false, error: "Not found" });
    const data = snap.data();
    console.log("[adminSponsorApproval] sponsor_approval data", data);

    try {
      await db
        .collection("sponsor_approvals")
        .doc(id)
        .update({
          status: "approved",
          reviewedBy: req.user.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          notes: notes || null,
        });
      console.log("[adminSponsorApproval] sponsor_approval doc updated");
    } catch (e) {
      console.error("[adminSponsorApproval] failed updating sponsor_approval doc", e && e.message);
      throw e;
    }

    // Update content.platform_options.<platform>.sponsorApproval
    const contentRef = db.collection("content").doc(data.contentId);
    const contentDoc = await contentRef.get();
    console.log("[adminSponsorApproval] fetched content doc", !!contentDoc.exists);
    if (contentDoc.exists) {
      const path = `platform_options.${data.platform}.sponsorApproval`;
      try {
        // Read existing platform_options and merge the sponsorApproval into the nested platform object
        const existing = contentDoc.data() || {};
        const pOpts = existing.platform_options || existing.platformOptions || {};
        const platformObj = pOpts[data.platform] || {};
        platformObj.sponsorApproval = {
          status: "approved",
          reviewedBy: req.user.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          notes: notes || null,
          sponsor: data.sponsor,
        };
        const newPOpts = { ...(pOpts || {}), [data.platform]: platformObj };
        await contentRef.set({ platform_options: newPOpts }, { merge: true });
        console.log("[adminSponsorApproval] content platform_options merged via set");
        try {
          const after = await contentRef.get();
          console.log("[adminSponsorApproval] content doc after set", JSON.stringify(after.data()));
        } catch (e) {
          console.warn(
            "[adminSponsorApproval] could not read content doc after set",
            e && e.message
          );
        }
      } catch (e) {
        console.error(
          "[adminSponsorApproval] failed merging content.platform_options",
          e && e.message
        );
        throw e;
      }

      // Notify content owner
      const content = contentDoc.data();
      if (content.user_id) {
        await db.collection("notifications").add({
          userId: content.user_id,
          type: "sponsor_approved",
          contentId: data.contentId,
          platform: data.platform,
          message: `Sponsor approved for ${data.platform}. Your content can now be published as a sponsored post.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("[adminSponsorApproval] notification queued");
      }

      // Log action
      await db.collection("audit_logs").add({
        action: "approve_sponsor",
        adminId: req.user.uid,
        sponsorApprovalId: id,
        contentId: data.contentId,
        platform: data.platform,
        sponsor: data.sponsor,
        notes: notes || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("[adminSponsorApproval] audit logged");

      // If content already approved, enqueue platform post
      const approvalStatus = content.approvalStatus || content.approval_status || null;
      console.log("[adminSponsorApproval] content approvalStatus", approvalStatus);
      if (approvalStatus === "approved") {
        try {
          const { enqueuePlatformPostTask } = require("../services/promotionTaskQueue");
          const options =
            (content.platform_options && content.platform_options[data.platform]) || {};
          await enqueuePlatformPostTask({
            contentId: data.contentId,
            uid: content.user_id || null,
            platform: data.platform,
            reason: "sponsor_approved",
            payload: {
              url: content.url,
              title: content.title,
              description: content.description,
              platformOptions: options,
              sponsor: data.sponsor,
            },
          });
          console.log("[adminSponsorApproval] enqueue invoked");
        } catch (e) {
          console.warn("enqueue after sponsor approval failed:", e && e.message);
        }
      }
    }

    res.json({ success: true, message: "Sponsor approved" });
  } catch (e) {
    console.error("Error approving sponsor:", e && e.message);
    if (e && e.stack) console.error(e.stack);
    // Return informative error for tests (include stack)
    res
      .status(500)
      .json({ success: false, error: e && (e.message || String(e)), stack: e && e.stack });
  }
});

// Reject sponsor
router.post("/:id/reject", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason)
      return res.status(400).json({ success: false, error: "Rejection reason required" });
    const snap = await db.collection("sponsor_approvals").doc(id).get();
    if (!snap.exists) return res.status(404).json({ success: false, error: "Not found" });
    const data = snap.data();

    await db
      .collection("sponsor_approvals")
      .doc(id)
      .update({
        status: "rejected",
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        notes: reason || null,
      });

    // Update content.platform_options.<platform>.sponsorApproval
    const contentRef = db.collection("content").doc(data.contentId);
    const contentDoc = await contentRef.get();
    if (contentDoc.exists) {
      const path = `platform_options.${data.platform}.sponsorApproval`;
      await contentRef.update({
        [path]: {
          status: "rejected",
          reviewedBy: req.user.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          notes: reason || null,
          sponsor: data.sponsor,
        },
      });

      // Notify content owner
      const content = contentDoc.data();
      if (content.user_id) {
        await db.collection("notifications").add({
          userId: content.user_id,
          type: "sponsor_rejected",
          contentId: data.contentId,
          platform: data.platform,
          message: `Sponsor request was rejected for ${data.platform}: ${reason}`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Log action
      await db.collection("audit_logs").add({
        action: "reject_sponsor",
        adminId: req.user.uid,
        sponsorApprovalId: id,
        contentId: data.contentId,
        platform: data.platform,
        sponsor: data.sponsor,
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({ success: true, message: "Sponsor rejected" });
  } catch (e) {
    console.error("Error rejecting sponsor:", e && e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
