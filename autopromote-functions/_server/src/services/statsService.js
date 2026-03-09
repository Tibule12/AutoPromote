const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");

/**
 * Service to handle efficient user statistics retrieval and updates.
 * Implements a "read-through" cache pattern using a subcollection on the user document.
 */
class StatsService {
  constructor() {
    this.collectionName = "stats";
    this.docName = "overview";
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get user overview stats, using cached values if available and fresh.
   * If cache is stale or missing, it recalculates from the content collection.
   * @param {string} userId
   * @returns {Promise<Object>} The stats object { totalViews, totalLikes, totalShares, totalRevenue }
   */
  async getUserOverview(userId) {
    if (!userId) throw new Error("userId is required");

    const statsRef = db
      .collection("users")
      .doc(userId)
      .collection(this.collectionName)
      .doc(this.docName);

    try {
      const statsSnap = await statsRef.get();
      const now = Date.now();

      // Check if cache exists
      if (statsSnap.exists) {
        const data = statsSnap.data();
        const lastUpdated = data.updatedAt ? data.updatedAt.toMillis() : 0;
        
        // STALE-WHILE-REVALIDATE PATTERN
        // If cache exists, return it immediately to keep UI fast.
        // If it's stale (> 5 mins), trigger a background refresh.
        if (now - lastUpdated > this.cacheDuration) {
          logger.debug(`[StatsService] Cache stale for user ${userId}. Triggering background refresh...`);
          // Fire and forget - do not await
          this.recalculateUserStats(userId).catch(err => 
            logger.error(`[StatsService] Background refresh failed for ${userId}:`, err)
          );
        }

        return {
          totalContent: data.totalContent || 0,
          totalViews: data.totalViews || 0,
          totalLikes: data.totalLikes || 0,
          totalShares: data.totalShares || 0,
          totalRevenue: data.totalRevenue || 0,
        };
      }

      // Cache miss or stale: Recalculate
      logger.debug(`[StatsService] Cache miss/stale for user ${userId}. Recalculating...`);
      return await this.recalculateUserStats(userId);

    } catch (error) {
      logger.error(`[StatsService] Error fetching stats for user ${userId}:`, error);
      // Fallback to empty stats on error to prevent breaking the UI
      return { totalContent: 0, totalViews: 0, totalLikes: 0, totalShares: 0, totalRevenue: 0 };
    }
  }

  /**
   * Recalculates stats by summing up all content documents.
   * This is the "expensive" operation we want to avoid, but it's the source of truth.
   * Saves the result to the stats subcollection for future fast reads.
   * @param {string} userId 
   */
  async recalculateUserStats(userId) {
    const contentRef = db.collection("content").where("userId", "==", userId);
    const contentSnapshot = await contentRef.get();

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalRevenue = 0;

    contentSnapshot.forEach((doc) => {
      const content = doc.data();
      totalViews += content.views || 0;
      totalLikes += content.likes || 0;
      totalShares += content.shares || 0;
      // totalRevenue += content.revenue || 0; // Disabled per existing logic
    });

    const stats = {
      totalContent: contentSnapshot.size,
      totalViews,
      totalLikes,
      totalShares,
      totalRevenue,
      updatedAt: new Date(), // Firestore Timestamp
    };

    // Update cache asynchronously (fire and forget)
    db.collection("users")
      .doc(userId)
      .collection(this.collectionName)
      .doc(this.docName)
      .set(stats)
      .catch((err) =>
        logger.error(`[StatsService] Failed to update stats cache for ${userId}:`, err)
      );

    return stats;
  }

  /**
   * Incrementally updates stats. Call this when content is uploaded or deleted.
   * @param {string} userId 
   * @param {Object} delta { contentCount, views, likes, shares }
   */
  async incrementStats(userId, delta = {}) {
    if (!userId) return;
    
    const statsRef = db
      .collection("users")
      .doc(userId)
      .collection(this.collectionName)
      .doc(this.docName);
      
    const FieldValue = require("firebase-admin").firestore.FieldValue;

    const update = {
      updatedAt: new Date(),
    };

    if (delta.contentCount) update.totalContent = FieldValue.increment(delta.contentCount);
    if (delta.views) update.totalViews = FieldValue.increment(delta.views);
    if (delta.likes) update.totalLikes = FieldValue.increment(delta.likes);
    if (delta.shares) update.totalShares = FieldValue.increment(delta.shares);

    try {
      await statsRef.set(update, { merge: true });
    } catch (err) {
      logger.warn(`[StatsService] Failed to increment stats for ${userId}, recalculating next time.`);
      // If the increment fails (e.g. doc doesn't exist), we do nothing.
      // The next read will see it's missing/stale and trigger a full recalculation.
    }
  }
}

module.exports = new StatsService();
