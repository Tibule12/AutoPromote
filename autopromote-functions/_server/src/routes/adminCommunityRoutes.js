const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { db, admin } = require("../firebaseAdmin");

// Get all community posts with filtering
router.get("/posts", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, flagged, limit = 50, offset = 0 } = req.query;

    let query = db.collection("community_posts");

    if (status) {
      query = query.where("status", "==", status);
    }

    if (flagged === "true") {
      query = query.where("flagCount", ">", 0);
    }

    const snapshot = await query
      .orderBy("createdAt", "desc")
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get();

    const posts = [];
    for (const doc of snapshot.docs) {
      const postData = doc.data();

      // Get user info
      let userData = null;
      if (postData.userId) {
        const userDoc = await db.collection("users").doc(postData.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: postData.userId,
            name: user.name,
            email: user.email,
          };
        }
      }

      posts.push({
        id: doc.id,
        ...postData,
        user: userData,
        createdAt: postData.createdAt?.toDate?.() || postData.createdAt,
      });
    }

    res.json({ success: true, posts, total: posts.length });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Flag/unflag a post
router.post("/posts/:postId/flag", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { postId } = req.params;
    const { reason, action } = req.body; // action: 'flag' or 'unflag'

    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      return res.status(404).json({ success: false, error: "Post not found" });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (action === "flag") {
      updateData.flagCount = admin.firestore.FieldValue.increment(1);
      updateData.flagReason = reason || "Admin flagged";
      updateData.flaggedBy = req.user.uid;
      updateData.status = "flagged";

      // Log the action
      await db.collection("audit_logs").add({
        action: "flag_post",
        adminId: req.user.uid,
        postId,
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (action === "unflag") {
      updateData.flagCount = 0;
      updateData.flagReason = admin.firestore.FieldValue.delete();
      updateData.flaggedBy = admin.firestore.FieldValue.delete();
      updateData.status = "active";

      await db.collection("audit_logs").add({
        action: "unflag_post",
        adminId: req.user.uid,
        postId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await postRef.update(updateData);

    res.json({ success: true, message: `Post ${action}ged successfully` });
  } catch (error) {
    console.error("Error flagging post:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a post
router.delete("/posts/:postId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { postId } = req.params;
    const { reason } = req.body;

    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      return res.status(404).json({ success: false, error: "Post not found" });
    }

    // Soft delete
    await postRef.update({
      status: "deleted",
      deletedBy: req.user.uid,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletionReason: reason || "Admin deleted",
    });

    // Log the action
    await db.collection("audit_logs").add({
      action: "delete_post",
      adminId: req.user.uid,
      postId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all comments for moderation
router.get("/comments", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { flagged, limit = 50 } = req.query;

    let query = db.collection("community_comments");

    if (flagged === "true") {
      query = query.where("flagCount", ">", 0);
    }

    const snapshot = await query.orderBy("createdAt", "desc").limit(parseInt(limit)).get();

    const comments = [];
    for (const doc of snapshot.docs) {
      const commentData = doc.data();

      // Get user info
      let userData = null;
      if (commentData.userId) {
        const userDoc = await db.collection("users").doc(commentData.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: commentData.userId,
            name: user.name,
            email: user.email,
          };
        }
      }

      comments.push({
        id: doc.id,
        ...commentData,
        user: userData,
        createdAt: commentData.createdAt?.toDate?.() || commentData.createdAt,
      });
    }

    res.json({ success: true, comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a comment
router.delete("/comments/:commentId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reason } = req.body;

    await db
      .collection("community_comments")
      .doc(commentId)
      .update({
        status: "deleted",
        deletedBy: req.user.uid,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletionReason: reason || "Admin deleted",
      });

    // Log the action
    await db.collection("audit_logs").add({
      action: "delete_comment",
      adminId: req.user.uid,
      commentId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get community statistics
router.get("/stats", authMiddleware, adminOnly, async (req, res) => {
  try {
    const [postsSnapshot, commentsSnapshot, likesSnapshot, flaggedPostsSnapshot] =
      await Promise.all([
        db.collection("community_posts").where("status", "==", "active").get(),
        db.collection("community_comments").where("status", "==", "active").get(),
        db.collection("community_likes").get(),
        db.collection("community_posts").where("status", "==", "flagged").get(),
      ]);

    // Get today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    const [newPostsToday, newCommentsToday] = await Promise.all([
      db.collection("community_posts").where("createdAt", ">=", todayTimestamp).get(),
      db.collection("community_comments").where("createdAt", ">=", todayTimestamp).get(),
    ]);

    res.json({
      success: true,
      stats: {
        totalPosts: postsSnapshot.size,
        totalComments: commentsSnapshot.size,
        totalLikes: likesSnapshot.size,
        flaggedPosts: flaggedPostsSnapshot.size,
        newPostsToday: newPostsToday.size,
        newCommentsToday: newCommentsToday.size,
      },
    });
  } catch (error) {
    console.error("Error fetching community stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk actions on posts
router.post("/posts/bulk", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { postIds, action, reason } = req.body;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid post IDs" });
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const postId of postIds) {
      const postRef = db.collection("community_posts").doc(postId);

      if (action === "delete") {
        batch.update(postRef, {
          status: "deleted",
          deletedBy: req.user.uid,
          deletedAt: timestamp,
          deletionReason: reason || "Bulk admin action",
        });
      } else if (action === "flag") {
        batch.update(postRef, {
          status: "flagged",
          flaggedBy: req.user.uid,
          flagReason: reason || "Bulk admin action",
          flagCount: admin.firestore.FieldValue.increment(1),
        });
      } else if (action === "approve") {
        batch.update(postRef, {
          status: "active",
          flagCount: 0,
          flagReason: admin.firestore.FieldValue.delete(),
        });
      }
    }

    await batch.commit();

    // Log bulk action
    await db.collection("audit_logs").add({
      action: `bulk_${action}_posts`,
      adminId: req.user.uid,
      postIds,
      reason,
      count: postIds.length,
      timestamp,
    });

    res.json({ success: true, message: `Bulk ${action} completed`, count: postIds.length });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ban/unban user from community
router.post("/users/:userId/ban", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason, duration } = req.body; // action: 'ban' or 'unban'

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (action === "ban") {
      const banUntil = duration
        ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + duration * 24 * 60 * 60 * 1000))
        : null;

      await userRef.update({
        communityBanned: true,
        banReason: reason,
        bannedBy: req.user.uid,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        banUntil,
      });

      // Hide all their posts
      const userPosts = await db
        .collection("community_posts")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .get();

      const batch = db.batch();
      userPosts.docs.forEach(doc => {
        batch.update(doc.ref, { status: "hidden", hiddenReason: "User banned" });
      });
      await batch.commit();

      await db.collection("audit_logs").add({
        action: "ban_user",
        adminId: req.user.uid,
        userId,
        reason,
        duration,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, message: "User banned from community" });
    } else if (action === "unban") {
      await userRef.update({
        communityBanned: false,
        banReason: admin.firestore.FieldValue.delete(),
        bannedBy: admin.firestore.FieldValue.delete(),
        banUntil: admin.firestore.FieldValue.delete(),
      });

      await db.collection("audit_logs").add({
        action: "unban_user",
        adminId: req.user.uid,
        userId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, message: "User unbanned from community" });
    }
  } catch (error) {
    console.error("Error banning user:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
