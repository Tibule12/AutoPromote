// communityRoutes.js
// Community feed with posts, likes, comments, and shares

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

// Apply rate limiting
const communityLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_COMMUNITY || "200", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "community",
});

router.use(communityLimiter);

/**
 * POST /api/community/posts
 * Create a new community post (video, image, audio, or text)
 */
router.post("/posts", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { contentId, type, caption, mediaUrl, thumbnailUrl } = req.body;

    if (!type || !["video", "image", "audio", "text"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Invalid post type. Must be video, image, audio, or text" });
    }

    if (type !== "text" && !mediaUrl) {
      return res.status(400).json({ error: "Media URL required for non-text posts" });
    }

    // Get user info
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create post
    const postData = {
      userId,
      userName: userData.name || userData.displayName || "Anonymous",
      userAvatar: userData.photoURL || null,
      contentId: contentId || null,
      type,
      caption: caption || "",
      mediaUrl: mediaUrl || null,
      thumbnailUrl: thumbnailUrl || null,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      viewsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };

    const postRef = await db.collection("community_posts").add(postData);

    res.status(201).json({
      success: true,
      postId: postRef.id,
      post: { id: postRef.id, ...postData },
    });
  } catch (error) {
    console.error("[Community] Create post error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

/**
 * GET /api/community/feed
 * Get community feed with pagination
 */
router.get("/feed", authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const lastPostId = req.query.lastPostId;
    const type = req.query.type; // Optional filter by type

    let query = db
      .collection("community_posts")
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (type && ["video", "image", "audio", "text"].includes(type)) {
      query = db
        .collection("community_posts")
        .where("status", "==", "active")
        .where("type", "==", type)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }

    if (lastPostId) {
      const lastPostDoc = await db.collection("community_posts").doc(lastPostId).get();
      if (lastPostDoc.exists) {
        query = query.startAfter(lastPostDoc);
      }
    }

    const snapshot = await query.get();
    const posts = [];

    for (const doc of snapshot.docs) {
      const postData = doc.data();
      posts.push({
        id: doc.id,
        ...postData,
      });
    }

    res.json({
      success: true,
      posts,
      hasMore: posts.length === limit,
    });
  } catch (error) {
    console.error("[Community] Get feed error:", error);
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

/**
 * GET /api/community/posts/:postId
 * Get single post details
 */
router.get("/posts/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    const postDoc = await db.collection("community_posts").doc(postId).get();

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const postData = postDoc.data();

    // Check if user liked this post
    const likeDoc = await db
      .collection("community_likes")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    const hasLiked = !likeDoc.empty;

    // Check if user marked helpful
    const helpfulDoc = await db
      .collection("community_helpful")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    const hasHelpful = !helpfulDoc.empty;

    // Increment view count
    await db
      .collection("community_posts")
      .doc(postId)
      .update({
        viewsCount: (postData.viewsCount || 0) + 1,
      });

    res.json({
      success: true,
      post: {
        id: postDoc.id,
        ...postData,
        hasLiked,
        hasHelpful,
        helpfulCount: postData.helpfulCount || (postData.helpful ? postData.helpful.length : 0),
      },
    });
  } catch (error) {
    console.error("[Community] Get post error:", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

/**
 * POST /api/community/posts/:postId/helpful
 * Mark a post as helpful
 */
router.post("/posts/:postId/helpful", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    // Check if already marked helpful
    const existing = await db
      .collection("community_helpful")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: "Already marked helpful" });
    }

    // Get user info
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create helpful record
    await db.collection("community_helpful").add({
      postId,
      userId,
      userName: userData.name || userData.displayName || "Anonymous",
      createdAt: new Date().toISOString(),
    });

    // Increment helpful count on post
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();
    if (postDoc.exists) {
      await postRef.update({
        helpfulCount: (postDoc.data().helpfulCount || 0) + 1,
      });

      // Notify post owner
      const postData = postDoc.data();
      if (postData.userId !== userId) {
        await db.collection("notifications").add({
          userId: postData.userId,
          type: "post_helpful",
          title: "Marked Helpful",
          message: `${userData.name || "Someone"} marked your post as helpful`,
          postId,
          actorId: userId,
          actorName: userData.name || "Anonymous",
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true, message: "Marked helpful" });
  } catch (error) {
    console.error("[Community] Mark helpful error:", error);
    res.status(500).json({ error: "Failed to mark helpful" });
  }
});

/**
 * DELETE /api/community/posts/:postId/helpful
 * Unmark a post as helpful
 */
router.delete("/posts/:postId/helpful", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    // Find and delete helpful record
    const snapshot = await db
      .collection("community_helpful")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Helpful mark not found" });
    }

    await snapshot.docs[0].ref.delete();

    // Decrement helpful count
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();
    if (postDoc.exists) {
      await postRef.update({
        helpfulCount: Math.max((postDoc.data().helpfulCount || 1) - 1, 0),
      });
    }

    res.json({ success: true, message: "Unmarked helpful" });
  } catch (error) {
    console.error("[Community] Unmark helpful error:", error);
    res.status(500).json({ error: "Failed to unmark helpful" });
  }
});

/**
 * POST /api/community/posts/:postId/like
 * Like a post
 */
router.post("/posts/:postId/like", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    // Check if already liked
    const existingLike = await db
      .collection("community_likes")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existingLike.empty) {
      return res.status(400).json({ error: "Post already liked" });
    }

    // Get user info
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create like
    await db.collection("community_likes").add({
      postId,
      userId,
      userName: userData.name || userData.displayName || "Anonymous",
      createdAt: new Date().toISOString(),
    });

    // Increment likes count
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (postDoc.exists) {
      await postRef.update({
        likesCount: (postDoc.data().likesCount || 0) + 1,
      });

      // Create notification for post owner
      const postData = postDoc.data();
      if (postData.userId !== userId) {
        await db.collection("notifications").add({
          userId: postData.userId,
          type: "post_like",
          title: "New Like",
          message: `${userData.name || "Someone"} liked your post`,
          postId,
          actorId: userId,
          actorName: userData.name || "Anonymous",
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      message: "Post liked successfully",
    });
  } catch (error) {
    console.error("[Community] Like post error:", error);
    res.status(500).json({ error: "Failed to like post" });
  }
});

/**
 * DELETE /api/community/posts/:postId/like
 * Unlike a post
 */
router.delete("/posts/:postId/like", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    // Find and delete like
    const likeSnapshot = await db
      .collection("community_likes")
      .where("postId", "==", postId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (likeSnapshot.empty) {
      return res.status(404).json({ error: "Like not found" });
    }

    await likeSnapshot.docs[0].ref.delete();

    // Decrement likes count
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (postDoc.exists) {
      await postRef.update({
        likesCount: Math.max((postDoc.data().likesCount || 1) - 1, 0),
      });
    }

    res.json({
      success: true,
      message: "Post unliked successfully",
    });
  } catch (error) {
    console.error("[Community] Unlike post error:", error);
    res.status(500).json({ error: "Failed to unlike post" });
  }
});

/**
 * GET /api/community/posts/:postId/comments
 * Get comments for a post
 */
router.get("/posts/:postId/comments", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const snapshot = await db
      .collection("community_comments")
      .where("postId", "==", postId)
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const comments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error("[Community] Get comments error:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

/**
 * POST /api/community/posts/:postId/comments
 * Add a comment to a post
 */
router.post("/posts/:postId/comments", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;
    const { text, parentCommentId } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    if (text.length > 1000) {
      return res.status(400).json({ error: "Comment too long (max 1000 characters)" });
    }

    // Get user info
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create comment
    const commentData = {
      postId,
      userId,
      userName: userData.name || userData.displayName || "Anonymous",
      userAvatar: userData.photoURL || null,
      text: text.trim(),
      parentCommentId: parentCommentId || null,
      likesCount: 0,
      repliesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };

    const commentRef = await db.collection("community_comments").add(commentData);

    // Increment comments count on post
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (postDoc.exists) {
      await postRef.update({
        commentsCount: (postDoc.data().commentsCount || 0) + 1,
      });

      // Create notification for post owner
      const postData = postDoc.data();
      if (postData.userId !== userId) {
        await db.collection("notifications").add({
          userId: postData.userId,
          type: "post_comment",
          title: "New Comment",
          message: `${userData.name || "Someone"} commented on your post: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
          postId,
          commentId: commentRef.id,
          actorId: userId,
          actorName: userData.name || "Anonymous",
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      // If replying to comment, notify parent commenter
      if (parentCommentId) {
        const parentComment = await db.collection("community_comments").doc(parentCommentId).get();
        if (parentComment.exists) {
          const parentData = parentComment.data();
          if (parentData.userId !== userId && parentData.userId !== postData.userId) {
            await db.collection("notifications").add({
              userId: parentData.userId,
              type: "comment_reply",
              title: "New Reply",
              message: `${userData.name || "Someone"} replied to your comment`,
              postId,
              commentId: commentRef.id,
              actorId: userId,
              actorName: userData.name || "Anonymous",
              read: false,
              createdAt: new Date().toISOString(),
            });
          }

          // Increment replies count on parent comment
          await db
            .collection("community_comments")
            .doc(parentCommentId)
            .update({
              repliesCount: (parentData.repliesCount || 0) + 1,
            });
        }
      }
    }

    res.status(201).json({
      success: true,
      commentId: commentRef.id,
      comment: {
        id: commentRef.id,
        ...commentData,
      },
    });
  } catch (error) {
    console.error("[Community] Add comment error:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

/**
 * POST /api/community/posts/:postId/share
 * Share a post
 */
router.post("/posts/:postId/share", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;
    const { platform, message } = req.body;

    // Get user info
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create share record
    await db.collection("community_shares").add({
      postId,
      userId,
      userName: userData.name || userData.displayName || "Anonymous",
      platform: platform || "internal",
      message: message || null,
      createdAt: new Date().toISOString(),
    });

    // Increment shares count
    const postRef = db.collection("community_posts").doc(postId);
    const postDoc = await postRef.get();

    if (postDoc.exists) {
      await postRef.update({
        sharesCount: (postDoc.data().sharesCount || 0) + 1,
      });

      // Create notification for post owner
      const postData = postDoc.data();
      if (postData.userId !== userId) {
        await db.collection("notifications").add({
          userId: postData.userId,
          type: "post_share",
          title: "Post Shared",
          message: `${userData.name || "Someone"} shared your post`,
          postId,
          actorId: userId,
          actorName: userData.name || "Anonymous",
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      message: "Post shared successfully",
    });
  } catch (error) {
    console.error("[Community] Share post error:", error);
    res.status(500).json({ error: "Failed to share post" });
  }
});

/**
 * DELETE /api/community/posts/:postId
 * Delete own post
 */
router.delete("/posts/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId || req.user?.uid;

    const postDoc = await db.collection("community_posts").doc(postId).get();

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const postData = postDoc.data();

    // Check if user owns the post
    if (postData.userId !== userId) {
      return res.status(403).json({ error: "Not authorized to delete this post" });
    }

    // Soft delete
    await db.collection("community_posts").doc(postId).update({
      status: "deleted",
      deletedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("[Community] Delete post error:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

/**
 * GET /api/community/user/:userId/posts
 * Get posts by specific user
 */
router.get("/user/:userId/posts", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const snapshot = await db
      .collection("community_posts")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const posts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      posts,
    });
  } catch (error) {
    console.error("[Community] Get user posts error:", error);
    res.status(500).json({ error: "Failed to fetch user posts" });
  }
});

/**
 * GET /api/community/trending
 * Get trending posts (most likes + comments in last 24 hours)
 */
router.get("/trending", authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const snapshot = await db
      .collection("community_posts")
      .where("status", "==", "active")
      .where("createdAt", ">=", oneDayAgo)
      .orderBy("createdAt", "desc")
      .limit(100) // Get more to sort by engagement
      .get();

    const posts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort by engagement score (likes + comments * 2 + shares * 3)
    posts.sort((a, b) => {
      const scoreA = (a.likesCount || 0) + (a.commentsCount || 0) * 2 + (a.sharesCount || 0) * 3;
      const scoreB = (b.likesCount || 0) + (b.commentsCount || 0) * 2 + (b.sharesCount || 0) * 3;
      return scoreB - scoreA;
    });

    res.json({
      success: true,
      posts: posts.slice(0, limit),
    });
  } catch (error) {
    console.error("[Community] Get trending error:", error);
    res.status(500).json({ error: "Failed to fetch trending posts" });
  }
});

/**
 * POST /api/community/follow/:userId
 * Follow a user
 */
router.post("/follow/:userId", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.userId || req.user?.uid;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    // Add to following collection
    await db.collection("community_following").doc(`${currentUserId}_${targetUserId}`).set({
      followerId: currentUserId,
      followingId: targetUserId,
      createdAt: new Date().toISOString(),
    });

    // Update follower/following counts
    await db
      .collection("community_user_stats")
      .doc(currentUserId)
      .set(
        {
          followingCount: require("firebase-admin").firestore.FieldValue.increment(1),
        },
        { merge: true }
      );

    await db
      .collection("community_user_stats")
      .doc(targetUserId)
      .set(
        {
          followersCount: require("firebase-admin").firestore.FieldValue.increment(1),
        },
        { merge: true }
      );

    res.json({ success: true, message: "Following user" });
  } catch (error) {
    console.error("[Community] Follow error:", error);
    res.status(500).json({ error: "Failed to follow user" });
  }
});

/**
 * DELETE /api/community/follow/:userId
 * Unfollow a user
 */
router.delete("/follow/:userId", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.userId || req.user?.uid;
    const targetUserId = req.params.userId;

    // Remove from following collection
    await db.collection("community_following").doc(`${currentUserId}_${targetUserId}`).delete();

    // Update follower/following counts
    await db
      .collection("community_user_stats")
      .doc(currentUserId)
      .set(
        {
          followingCount: require("firebase-admin").firestore.FieldValue.increment(-1),
        },
        { merge: true }
      );

    await db
      .collection("community_user_stats")
      .doc(targetUserId)
      .set(
        {
          followersCount: require("firebase-admin").firestore.FieldValue.increment(-1),
        },
        { merge: true }
      );

    res.json({ success: true, message: "Unfollowed user" });
  } catch (error) {
    console.error("[Community] Unfollow error:", error);
    res.status(500).json({ error: "Failed to unfollow user" });
  }
});

/**
 * GET /api/community/following
 * Get list of users the current user follows
 */
router.get("/following", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    const followingSnapshot = await db
      .collection("community_following")
      .where("followerId", "==", userId)
      .get();

    const following = followingSnapshot.docs.map(doc => doc.data().followingId);

    res.json({ success: true, following });
  } catch (error) {
    console.error("[Community] Get following error:", error);
    res.status(500).json({ error: "Failed to fetch following list" });
  }
});

/**
 * GET /api/community/suggestions
 * Get suggested creators to follow (based on engagement, AI clip usage)
 */
router.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const limit = parseInt(req.query.limit) || 10;

    // Get users current user is already following
    const followingSnapshot = await db
      .collection("community_following")
      .where("followerId", "==", userId)
      .get();
    const followingIds = followingSnapshot.docs.map(doc => doc.data().followingId);

    // Get top creators by post count and engagement
    const postsSnapshot = await db
      .collection("community_posts")
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    // Aggregate creator stats
    const creatorStats = {};
    postsSnapshot.docs.forEach(doc => {
      const post = doc.data();
      const creatorId = post.userId;

      if (creatorId === userId || followingIds.includes(creatorId)) {
        return; // Skip self and already following
      }

      if (!creatorStats[creatorId]) {
        creatorStats[creatorId] = {
          userId: creatorId,
          userName: post.userName,
          avatar: post.userAvatar,
          postsCount: 0,
          totalEngagement: 0,
          aiClipsCount: 0,
        };
      }

      creatorStats[creatorId].postsCount++;
      creatorStats[creatorId].totalEngagement +=
        (post.likesCount || 0) + (post.commentsCount || 0) + (post.sharesCount || 0);
      if (post.isAIGenerated) {
        creatorStats[creatorId].aiClipsCount++;
      }
    });

    // Get follower counts
    const statsSnapshot = await db.collection("community_user_stats").get();
    const followerCounts = {};
    statsSnapshot.docs.forEach(doc => {
      followerCounts[doc.id] = doc.data().followersCount || 0;
    });

    // Convert to array and sort by engagement score
    const suggestions = Object.values(creatorStats)
      .map(creator => ({
        ...creator,
        followersCount: followerCounts[creator.userId] || 0,
        engagementScore: creator.totalEngagement + creator.aiClipsCount * 10, // Bonus for AI clips
      }))
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit)
      .map(({ engagementScore, totalEngagement, aiClipsCount, ...rest }) => rest); // Remove internal scores

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error("[Community] Get suggestions error:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

module.exports = router;
