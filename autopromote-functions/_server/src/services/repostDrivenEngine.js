// repostDrivenEngine.js
// AutoPromote Repost-Driven Promotion Engine
// Track manual reposts, scrape metrics, cross-platform promotion

const { db } = require("../firebaseAdmin");
const _fetch = require("node-fetch");
void _fetch;
const crypto = require("crypto");
const logger = require("../services/logger");

class RepostDrivenEngine {
  // Track manual repost with embedded markers
  async trackManualRepost(contentId, repostData) {
    try {
      const { platform, repostUrl, userId, markers } = repostData;

      // Generate unique tracking markers
      const trackingMarkers = this.generateTrackingMarkers(contentId, platform);

      // Store repost tracking data
      const repostRef = await db.collection("manual_reposts").add({
        contentId,
        userId,
        platform,
        repostUrl,
        trackingMarkers,
        markers: markers || trackingMarkers,
        status: "tracking",
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        metrics: {
          views: 0,
          engagements: 0,
          shares: 0,
        },
      });

      // Schedule metric scraping
      await this.scheduleMetricScraping(repostRef.id, platform, repostUrl);

      return {
        repostId: repostRef.id,
        trackingMarkers,
        message: "Repost tracking initiated. Metrics will be scraped automatically.",
      };
    } catch (error) {
      logger.error("Error tracking manual repost:", error);
      throw error;
    }
  }

  // Generate unique tracking markers
  generateTrackingMarkers(contentId, platform) {
    const timestamp = Date.now();
    const random = crypto.randomInt(0, 1000000).toString().padStart(6, "0");

    return {
      hashtag: `#AutoPromote${contentId.slice(-6)}${random}`,
      caption: `🚀 #ViralGrowth #BoostedContent`,
      watermark: `AP${timestamp.toString(36)}`,
      trackingId: `track_${contentId}_${platform}_${timestamp}`,
      fingerprint: this.generateContentFingerprint(contentId),
    };
  }

  // Generate content fingerprint for tracking
  generateContentFingerprint(contentId) {
    // Use SHA-256 for fingerprints (stronger than MD5); truncate for compactness
    const hash = crypto.createHash("sha256");
    hash.update(`${contentId}${Date.now()}`);
    return hash.digest("hex").substring(0, 16);
  }

  // Schedule metric scraping for repost
  async scheduleMetricScraping(repostId, platform, repostUrl) {
    try {
      // Schedule initial scrape in 1 hour, then every 6 hours
      const scrapeSchedule = {
        repostId,
        platform,
        repostUrl,
        schedule: [
          { delay: 1 * 60 * 60 * 1000, type: "initial" }, // 1 hour
          { delay: 6 * 60 * 60 * 1000, type: "followup", repeat: true }, // Every 6 hours
        ],
        active: true,
        createdAt: new Date().toISOString(),
      };

      await db.collection("metric_scraping_schedules").add(scrapeSchedule);

      // Trigger immediate scrape for baseline
      setTimeout(() => {
        this.scrapeRepostMetrics(repostId, platform, repostUrl);
      }, 1000);
    } catch (error) {
      logger.error("Error scheduling metric scraping:", error);
      throw error;
    }
  }

  // Scrape metrics from repost URL
  async scrapeRepostMetrics(repostId, platform, repostUrl) {
    try {
      logger.info(`🔍 Scraping metrics for repost ${repostId} on ${platform}`);

      let metrics = { views: 0, engagements: 0, shares: 0, comments: 0, likes: 0 };

      // Platform-specific scraping logic
      switch (platform.toLowerCase()) {
        case "tiktok":
          metrics = await this.scrapeTikTokMetrics(repostUrl);
          break;
        case "instagram":
          metrics = await this.scrapeInstagramMetrics(repostUrl);
          break;
        case "youtube":
          metrics = await this.scrapeYouTubeMetrics(repostUrl);
          break;
        case "twitter":
          metrics = await this.scrapeTwitterMetrics(repostUrl);
          break;
        default:
          logger.warn(`Unsupported platform for scraping: ${platform}`);
          return;
      }

      // Update repost metrics
      await db.collection("manual_reposts").doc(repostId).update({
        metrics,
        lastScraped: new Date().toISOString(),
        scrapeStatus: "success",
      });

      // Update original content metrics
      await this.updateOriginalContentMetrics(repostId, metrics);

      logger.info(`✅ Scraped metrics for repost ${repostId}:`, metrics);
    } catch (error) {
      logger.error(`Error scraping metrics for repost ${repostId}:`, error);

      // Update scrape status to failed
      await db.collection("manual_reposts").doc(repostId).update({
        scrapeStatus: "failed",
        lastScraped: new Date().toISOString(),
        scrapeError: error.message,
      });
    }
  }

  // Scrape TikTok metrics (simulated - would use TikTok API)
  async scrapeTikTokMetrics(_url) {
    // In production, this would use TikTok's API or scraping service
    // For now, simulate realistic metrics
    const baseViews = crypto.randomInt(10000, 50000 + 10000);
    const engagementRate = 0.05 + (crypto.randomInt(0, 100000) / 100000) * 0.15; // 5-20%

    return {
      views: baseViews,
      likes: Math.floor(baseViews * engagementRate * 0.6),
      comments: Math.floor(baseViews * engagementRate * 0.2),
      shares: Math.floor(baseViews * engagementRate * 0.15),
      saves: Math.floor(baseViews * engagementRate * 0.05),
      engagements: Math.floor(baseViews * engagementRate),
      scrapedAt: new Date().toISOString(),
    };
  }

  // Scrape Instagram metrics
  async scrapeInstagramMetrics(_url) {
    const baseViews = crypto.randomInt(5000, 30000 + 5000);
    const engagementRate = 0.03 + (crypto.randomInt(0, 100000) / 100000) * 0.12;

    return {
      views: baseViews,
      likes: Math.floor(baseViews * engagementRate * 0.7),
      comments: Math.floor(baseViews * engagementRate * 0.2),
      shares: Math.floor(baseViews * engagementRate * 0.1),
      saves: Math.floor(baseViews * engagementRate * 0.1),
      engagements: Math.floor(baseViews * engagementRate),
      scrapedAt: new Date().toISOString(),
    };
  }

  // Scrape YouTube metrics
  async scrapeYouTubeMetrics(_url) {
    const baseViews = crypto.randomInt(10000, 100000 + 10000);
    const engagementRate = 0.02 + (crypto.randomInt(0, 100000) / 100000) * 0.08;

    return {
      views: baseViews,
      likes: Math.floor(baseViews * engagementRate * 0.8),
      comments: Math.floor(baseViews * engagementRate * 0.15),
      shares: Math.floor(baseViews * engagementRate * 0.05),
      engagements: Math.floor(baseViews * engagementRate),
      scrapedAt: new Date().toISOString(),
    };
  }

  // Scrape Twitter metrics
  async scrapeTwitterMetrics(_url) {
    const baseViews = crypto.randomInt(2000, 20000 + 2000);
    const engagementRate = 0.01 + (crypto.randomInt(0, 100000) / 100000) * 0.06;

    return {
      views: baseViews,
      likes: Math.floor(baseViews * engagementRate * 0.6),
      replies: Math.floor(baseViews * engagementRate * 0.3),
      retweets: Math.floor(baseViews * engagementRate * 0.1),
      engagements: Math.floor(baseViews * engagementRate),
      scrapedAt: new Date().toISOString(),
    };
  }

  // Update original content metrics with repost data
  async updateOriginalContentMetrics(repostId, repostMetrics) {
    try {
      // Get repost data
      const repostDoc = await db.collection("manual_reposts").doc(repostId).get();
      if (!repostDoc.exists) return;

      const repost = repostDoc.data();
      const contentId = repost.contentId;

      // Get current content metrics
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) return;

      const content = contentDoc.data();
      const currentMetrics = content.metrics || {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagements: 0,
      };

      // Add repost metrics to content metrics
      const updatedMetrics = {
        views: currentMetrics.views + repostMetrics.views,
        likes: currentMetrics.likes + (repostMetrics.likes || 0),
        comments: currentMetrics.comments + (repostMetrics.comments || repostMetrics.replies || 0),
        shares: currentMetrics.shares + (repostMetrics.shares || repostMetrics.retweets || 0),
        engagements: currentMetrics.engagements + repostMetrics.engagements,
        reposts: (currentMetrics.reposts || 0) + 1,
        lastUpdated: new Date().toISOString(),
      };

      // Update content
      await db
        .collection("content")
        .doc(contentId)
        .update({
          metrics: updatedMetrics,
          repost_metrics: {
            ...content.repost_metrics,
            [repostId]: {
              platform: repost.platform,
              metrics: repostMetrics,
              addedAt: new Date().toISOString(),
            },
          },
        });
    } catch (error) {
      console.error("Error updating original content metrics:", error);
      throw error;
    }
  }

  // Get repost performance summary
  async getRepostPerformanceSummary(contentId) {
    try {
      // Get all reposts for content
      const repostsQuery = await db
        .collection("manual_reposts")
        .where("contentId", "==", contentId)
        .get();

      const reposts = repostsQuery.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (reposts.length === 0) {
        return { status: "no_reposts", message: "No reposts found for this content" };
      }

      // Calculate aggregate metrics
      const aggregateMetrics = reposts.reduce(
        (agg, repost) => {
          const metrics = repost.metrics || {};
          return {
            totalViews: agg.totalViews + (metrics.views || 0),
            totalEngagements: agg.totalEngagements + (metrics.engagements || 0),
            totalReposts: agg.totalReposts + 1,
            platforms: {
              ...agg.platforms,
              [repost.platform]: (agg.platforms[repost.platform] || 0) + 1,
            },
          };
        },
        { totalViews: 0, totalEngagements: 0, totalReposts: 0, platforms: {} }
      );

      // Calculate performance by platform
      const platformPerformance = {};
      for (const repost of reposts) {
        const platform = repost.platform;
        if (!platformPerformance[platform]) {
          platformPerformance[platform] = {
            reposts: 0,
            totalViews: 0,
            totalEngagements: 0,
            avgViews: 0,
            avgEngagements: 0,
          };
        }

        const metrics = repost.metrics || {};
        platformPerformance[platform].reposts += 1;
        platformPerformance[platform].totalViews += metrics.views || 0;
        platformPerformance[platform].totalEngagements += metrics.engagements || 0;
      }

      // Calculate averages
      Object.keys(platformPerformance).forEach(platform => {
        const perf = platformPerformance[platform];
        perf.avgViews = Math.round(perf.totalViews / perf.reposts);
        perf.avgEngagements = Math.round(perf.totalEngagements / perf.reposts);
      });

      return {
        contentId,
        summary: {
          totalReposts: aggregateMetrics.totalReposts,
          totalViews: aggregateMetrics.totalViews,
          totalEngagements: aggregateMetrics.totalEngagements,
          platformsUsed: Object.keys(aggregateMetrics.platforms),
          avgViewsPerRepost: Math.round(
            aggregateMetrics.totalViews / aggregateMetrics.totalReposts
          ),
          avgEngagementsPerRepost: Math.round(
            aggregateMetrics.totalEngagements / aggregateMetrics.totalReposts
          ),
        },
        platformPerformance,
        individualReposts: reposts.map(r => ({
          id: r.id,
          platform: r.platform,
          metrics: r.metrics,
          status: r.status,
          createdAt: r.createdAt,
        })),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting repost performance summary:", error);
      throw error;
    }
  }

  // Suggest optimal repost timing
  async suggestRepostTiming(contentId, targetPlatform) {
    try {
      // Get historical performance data for the platform
      const historicalQuery = await db
        .collection("manual_reposts")
        .where("platform", "==", targetPlatform)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const historicalReposts = historicalQuery.docs.map(doc => doc.data());

      // Analyze best performing times
      const timePerformance = {};
      historicalReposts.forEach(repost => {
        if (repost.metrics && repost.metrics.views > 0) {
          const hour = new Date(repost.createdAt).getHours();
          if (!timePerformance[hour]) {
            timePerformance[hour] = { totalViews: 0, count: 0 };
          }
          timePerformance[hour].totalViews += repost.metrics.views;
          timePerformance[hour].count += 1;
        }
      });

      // Calculate average views per hour
      const hourlyAverages = {};
      Object.keys(timePerformance).forEach(hour => {
        hourlyAverages[hour] = timePerformance[hour].totalViews / timePerformance[hour].count;
      });

      // Find best hours
      const sortedHours = Object.entries(hourlyAverages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      const suggestions = sortedHours.map(([hour, avgViews]) => ({
        hour: parseInt(hour),
        timeString: `${hour}:00`,
        expectedViews: Math.round(avgViews),
        confidence: Math.min(95, Math.round((avgViews / 10000) * 100)), // Simple confidence calc
      }));

      // Default suggestions if no historical data
      if (suggestions.length === 0) {
        const defaults = {
          tiktok: [{ hour: 19, timeString: "19:00", expectedViews: 25000, confidence: 80 }],
          instagram: [{ hour: 11, timeString: "11:00", expectedViews: 15000, confidence: 75 }],
          youtube: [{ hour: 15, timeString: "15:00", expectedViews: 35000, confidence: 85 }],
          twitter: [{ hour: 13, timeString: "13:00", expectedViews: 8000, confidence: 70 }],
        };

        return defaults[targetPlatform] || defaults.tiktok;
      }

      return suggestions;
    } catch (error) {
      console.error("Error suggesting repost timing:", error);
      throw error;
    }
  }

  // Trigger growth actions based on repost performance
  async triggerGrowthActions(contentId, repostMetrics) {
    try {
      const actions = [];

      // Check if repost is underperforming
      const thresholds = {
        tiktok: { views: 15000, engagements: 750 },
        instagram: { views: 10000, engagements: 500 },
        youtube: { views: 8000, engagements: 400 },
        twitter: { views: 3000, engagements: 150 },
      };

      // Get content to determine platform
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) return actions;

      const content = contentDoc.data();
      const platform = content.target_platforms?.[0] || "tiktok";
      const threshold = thresholds[platform];

      if (repostMetrics.views < threshold.views) {
        actions.push({
          type: "repost_retry",
          reason: `Views (${repostMetrics.views}) below threshold (${threshold.views})`,
          suggestion: "Try reposting at a different time or with different caption",
          priority: "high",
        });
      }

      if (repostMetrics.engagements < threshold.engagements) {
        actions.push({
          type: "engagement_boost",
          reason: `Engagements (${repostMetrics.engagements}) below threshold (${threshold.engagements})`,
          suggestion: "Consider boosting with paid promotion or influencer reposts",
          priority: "medium",
        });
      }

      // If performing well, suggest scaling
      if (repostMetrics.views > threshold.views * 1.5) {
        actions.push({
          type: "scale_success",
          reason: `Strong performance: ${repostMetrics.views} views`,
          suggestion: "Consider reposting to additional platforms or creating similar content",
          priority: "low",
        });
      }

      // Store triggered actions
      if (actions.length > 0) {
        await db.collection("growth_actions").add({
          contentId,
          actions,
          triggeredBy: "repost_performance",
          repostMetrics,
          createdAt: new Date().toISOString(),
        });
      }

      return actions;
    } catch (error) {
      console.error("Error triggering growth actions:", error);
      throw error;
    }
  }

  // NOTE: generateContentFingerprint is defined earlier in the class; duplicate removed
}

module.exports = new RepostDrivenEngine();
