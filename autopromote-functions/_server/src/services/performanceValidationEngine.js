// performanceValidationEngine.js
// Validates performance improvements between original and optimized content
// Used for "Results-Based Pricing" and "Performance Reporting"

const { db } = require("../firebaseAdmin");
const logger = require("./logger");

class PerformanceValidationEngine {
  /**
   * Fetch metrics for a specific platform post
   * @param {string} postId - The internal Firestore ID of the platform_post
   */
  async fetchMetrics(postId) {
    try {
      const doc = await db.collection("platform_posts").doc(postId).get();
      if (!doc.exists) {
        throw new Error(`Platform post ${postId} not found`);
      }
      const data = doc.data();
      return {
        id: postId,
        platform: data.platform,
        createdAt: data.createdAt,
        metrics: data.metrics || {
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          impressions: 0,
        },
      };
    } catch (error) {
      logger.error(`[PerformanceValidation] Error fetching metrics for ${postId}:`, error);
      return null;
    }
  }

  /**
   * Compare two sets of metrics to calculate lift
   * @param {object} original - Metrics object of original post
   * @param {object} optimized - Metrics object of optimized/reposted variant
   */
  compare(original, optimized) {
    if (!original || !optimized) return null;

    const m1 = original.metrics || {};
    const m2 = optimized.metrics || {};

    const normalize = (val) => (val ? parseInt(val, 10) : 0);

    const diff = {
      views: normalize(m2.views || m2.view_count) - normalize(m1.views || m1.view_count),
      likes: normalize(m2.likes || m2.like_count) - normalize(m1.likes || m1.like_count),
      shares: normalize(m2.shares || m2.share_count) - normalize(m1.shares || m1.share_count),
      comments: normalize(m2.comments || m2.comment_count) - normalize(m1.comments || m1.comment_count),
    };

    // Calculate percentage lift (safety check for divide by zero)
    const lift = {
      views: this.calculatePercentage(diff.views, normalize(m1.views || m1.view_count)),
      likes: this.calculatePercentage(diff.likes, normalize(m1.likes || m1.like_count)),
    };

    return {
      originalId: original.id,
      optimizedId: optimized.id,
      platform: original.platform,
      diff,
      lift,
      isImproved: diff.views > 0, // Basic definition of improvement
    };
  }

  calculatePercentage(diff, base) {
    if (base === 0) return diff > 0 ? 100 : 0; // If base was 0 and we got views, that's 100% (or infinite) lift
    return parseFloat(((diff / base) * 100).toFixed(2));
  }

  /**
   * Main validation workflow
   * @param {string} originalPostId - ID of failure/baseline post
   * @param {string} optimizedPostId - ID of new optimized post
   */
  async validatePerformance(originalPostId, optimizedPostId) {
    const original = await this.fetchMetrics(originalPostId);
    const optimized = await this.fetchMetrics(optimizedPostId);

    if (!original || !optimized) {
      return { success: false, error: "Could not fetch metrics for comparison" };
    }

    const result = this.compare(original, optimized);

    // Persist validation result for audit/pricing
    await this.logValidationResult(result);

    return {
      success: true,
      report: result,
    };
  }

  async logValidationResult(result) {
    try {
      await db.collection("performance_validations").add({
        ...result,
        validatedAt: new Date().toISOString(),
      });
    } catch (e) {
      logger.error("[PerformanceValidation] Failed to log result", e);
    }
  }
}

module.exports = new PerformanceValidationEngine();
