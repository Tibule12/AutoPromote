const { db } = require("./firebaseAdmin");
const optimizationService = require("./optimizationService");
const paypalClient = require("./paypalClient");
const paypal = require("@paypal/paypal-server-sdk");
const { enqueuePlatformPostTask } = require("./src/services/promotionTaskQueue");

class PromotionService {
  // Schedule a promotion for content with advanced algorithms
  async schedulePromotion(contentId, scheduleData) {
    try {
      console.log(`📊 Scheduling promotion for content ID: ${contentId}`);
      console.log("📋 Schedule data:", scheduleData);

      // Get content details for optimization
      const contentRef = db.collection("content").doc(contentId);
      const contentDoc = await contentRef.get();

      if (!contentDoc.exists) {
        const error = new Error("Content not found");
        console.error("❌ Error fetching content:", error);
        throw error;
      }

      const content = { id: contentDoc.id, ...contentDoc.data() };

      // Apply platform-specific optimization if not specified
      let optimizedScheduleData = { ...scheduleData };
      if (!scheduleData.platform_specific_settings && scheduleData.platform) {
        optimizedScheduleData.platform_specific_settings = this.optimizePlatformSettings(
          content,
          scheduleData.platform,
          scheduleData
        );
      }

      // Calculate optimal budget if not specified
      if (!scheduleData.budget && content) {
        optimizedScheduleData.budget = optimizationService.calculateOptimalBudget(content, {
          platform: scheduleData.platform || "all",
        });
      }

      // Create new promotion schedule in Firestore
      const scheduleRef = db.collection("promotion_schedules").doc();
      const promotionScheduleData = {
        contentId,
        platform: optimizedScheduleData.platform,
        scheduleType: optimizedScheduleData.schedule_type || "specific",
        startTime: optimizedScheduleData.start_time,
        endTime: optimizedScheduleData.end_time,
        frequency: optimizedScheduleData.frequency,
        isActive: optimizedScheduleData.is_active !== false,
        budget: optimizedScheduleData.budget || 0,
        targetMetrics: optimizedScheduleData.target_metrics || {},
        platformSpecificSettings: optimizedScheduleData.platform_specific_settings || {},
        recurrencePattern: optimizedScheduleData.recurrence_pattern,
        maxOccurrences: optimizedScheduleData.max_occurrences,
        timezone: optimizedScheduleData.timezone || "UTC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await scheduleRef.set(promotionScheduleData);
      const newSchedule = { id: scheduleRef.id, ...promotionScheduleData };
      console.log("✅ Promotion scheduled successfully:", newSchedule);

      // If this is a recurring schedule, create the next occurrence
      if (optimizedScheduleData.frequency && optimizedScheduleData.frequency !== "once") {
        await this.createNextRecurrence(newSchedule);
      }

      return newSchedule;
    } catch (error) {
      console.error("❌ Error scheduling promotion:", error);
      console.error("📋 Error stack:", error.stack);
      throw error;
    }
  }

  // Optimize platform-specific settings
  optimizePlatformSettings(content, platform, scheduleData) {
    const settings = {};

    switch (platform) {
      case "youtube":
        settings.optimal_time = "15:00-17:00";
        settings.target_cpm =
          optimizationService.calculateOptimalRPM(content.type, "youtube") / 1000;
        settings.audience_targeting = ["related_content", "demographic"];
        break;
      case "tiktok":
        settings.optimal_time = "19:00-21:00";
        settings.hashtag_strategy = "trending";
        settings.video_length = "15-60s";
        break;
      case "instagram":
        settings.optimal_time = "11:00-13:00,19:00-21:00";
        settings.story_duration = "24h";
        settings.carousel_slides = 3;
        break;
      case "facebook":
        settings.optimal_time = "09:00-11:00,13:00-15:00";
        settings.boost_duration = "7d";
        settings.targeting = ["interests", "location"];
        break;
      default:
        settings.optimal_time = "12:00-14:00";
    }

    return settings;
  }

  // Create next recurrence for a promotion schedule
  async createNextRecurrence(schedule) {
    try {
      const nextTime = this.calculateNextPromotionTime(
        schedule.startTime,
        schedule.frequency,
        schedule.recurrencePattern
      );

      if (!nextTime) return null;

      // Check max occurrences before creating a new document
      if (schedule.maxOccurrences) {
        const occurrenceCount = await this.getOccurrenceCount(schedule.id);
        if (occurrenceCount >= schedule.maxOccurrences) {
          console.log(
            `⏹️ Max occurrences (${schedule.maxOccurrences}) reached for schedule ${schedule.id}`
          );
          return null;
        }
      }

      const nextRef = db.collection("promotion_schedules").doc();
      const nextSchedule = {
        contentId: schedule.contentId,
        platform: schedule.platform,
        scheduleType: schedule.scheduleType,
        startTime: nextTime,
        endTime: schedule.endTime || null,
        frequency: schedule.frequency,
        isActive: schedule.isActive,
        budget: schedule.budget,
        targetMetrics: schedule.targetMetrics || {},
        platformSpecificSettings: schedule.platformSpecificSettings || {},
        recurrencePattern: schedule.recurrencePattern || null,
        parentScheduleId: schedule.id,
        timezone: schedule.timezone || "UTC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await nextRef.set(nextSchedule);
      const created = { id: nextRef.id, ...nextSchedule };
      console.log(`✅ Created next recurrence for schedule ${schedule.id}:`, created);
      return created;
    } catch (error) {
      console.error("Error in createNextRecurrence:", error);
      return null;
    }
  }

  // Get occurrence count for a schedule
  async getOccurrenceCount(scheduleId) {
    try {
      const snapshot = await db
        .collection("promotion_schedules")
        .where("id", "==", scheduleId)
        .get();

      const recurrencesSnapshot = await db
        .collection("promotion_schedules")
        .where("parentScheduleId", "==", scheduleId)
        .get();

      return snapshot.size + recurrencesSnapshot.size;
    } catch (error) {
      console.error("Error getting occurrence count:", error);
      return 0;
    }
  }

  // Get all promotion schedules for content
  async getContentPromotionSchedules(contentId) {
    try {
      const snapshot = await db
        .collection("promotion_schedules")
        .where("contentId", "==", contentId)
        .orderBy("startTime")
        .get();

      const schedules = [];
      snapshot.forEach(doc => {
        schedules.push({ id: doc.id, ...doc.data() });
      });

      return schedules;
    } catch (error) {
      console.error("Error getting promotion schedules:", error);
      throw error;
    }
  }

  // Update promotion schedule
  async updatePromotionSchedule(scheduleId, updates) {
    try {
      const scheduleRef = db.collection("promotion_schedules").doc(scheduleId);
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await scheduleRef.update(updateData);
      const updatedDoc = await scheduleRef.get();

      if (!updatedDoc.exists) {
        throw new Error("Schedule not found after update");
      }

      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      console.error("Error updating promotion schedule:", error);
      throw error;
    }
  }

  // Delete promotion schedule and its recurrences
  async deletePromotionSchedule(scheduleId) {
    try {
      // First get all recurrences
      const recurrencesSnapshot = await db
        .collection("promotion_schedules")
        .where("parentScheduleId", "==", scheduleId)
        .get();

      // Delete recurrences in a batch
      const batch = db.batch();
      recurrencesSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Add main schedule deletion to batch
      const scheduleRef = db.collection("promotion_schedules").doc(scheduleId);
      batch.delete(scheduleRef);

      // Execute the batch
      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error("Error deleting promotion schedule:", error);
      throw error;
    }
  }

  // Get active promotions with advanced filtering
  async getActivePromotions(filters = {}) {
    try {
      // Simplified query to avoid complex index requirements (filter in memory instead)
      let query = db
        .collection("promotion_schedules")
        .where("isActive", "==", true);

      // Apply filters
      if (filters.platform) {
        query = query.where("platform", "==", filters.platform);
      }
      if (filters.minBudget) {
        query = query.where("budget", ">=", filters.minBudget);
      }
      if (filters.maxBudget) {
        query = query.where("budget", "<=", filters.maxBudget);
      }

      const snapshot = await query.get();
      const promotions = [];
      const now = new Date().toISOString();

      // Get all promotions
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Manual filter for startTime (replaces the DB query constraint)
        if (data.startTime > now) continue;
        
        const promotion = { id: doc.id, ...data };

        // Get associated content
        const contentDoc = await db.collection("content").doc(promotion.contentId).get();
        if (contentDoc.exists) {
          promotion.content = { id: contentDoc.id, ...contentDoc.data() };

          // Apply content type filter if specified
          if (filters.content_type && promotion.content.type !== filters.content_type) {
            continue;
          }

          promotions.push(promotion);
        }
      }

      return promotions;
    } catch (error) {
      console.error("Error getting active promotions:", error);
      throw error;
    }
  }

  // Advanced next promotion time calculation with recurrence patterns
  calculateNextPromotionTime(startTime, frequency, recurrencePattern = null) {
    const start = new Date(startTime);
    let nextTime = new Date(start);

    if (recurrencePattern) {
      // Handle complex recurrence patterns
      return this.calculateFromRecurrencePattern(start, recurrencePattern);
    }

    switch (frequency) {
      case "hourly":
        nextTime.setHours(start.getHours() + 1);
        break;
      case "daily":
        nextTime.setDate(start.getDate() + 1);
        break;
      case "weekly":
        nextTime.setDate(start.getDate() + 7);
        break;
      case "biweekly":
        nextTime.setDate(start.getDate() + 14);
        break;
      case "monthly":
        nextTime.setMonth(start.getMonth() + 1);
        break;
      case "quarterly":
        nextTime.setMonth(start.getMonth() + 3);
        break;
      default:
        return null; // One-time schedule
    }

    return nextTime.toISOString();
  }

  // Calculate from complex recurrence patterns
  calculateFromRecurrencePattern(startDate, pattern) {
    const date = new Date(startDate);

    if (pattern.type === "custom") {
      switch (pattern.unit) {
        case "days":
          date.setDate(date.getDate() + pattern.interval);
          break;
        case "weeks":
          date.setDate(date.getDate() + pattern.interval * 7);
          break;
        case "months":
          date.setMonth(date.getMonth() + pattern.interval);
          break;
      }
    }
    // Add more pattern types as needed

    return date.toISOString();
  }

  // Process completed promotions and create next recurrences
  async processCompletedPromotions() {
    try {
      const now = new Date().toISOString();

      // Get promotions that have ended - Simplified to avoid index errors
      const snapshot = await db
        .collection("promotion_schedules")
        .where("isActive", "==", true)
        // .where("endTime", "<=", now) // Cause of 9 FAILED_PRECONDITION
        .get();

      const batch = db.batch();
      const completedPromotions = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Manual filter for endTime
        if (data.endTime && data.endTime <= now) {
            const promotion = { id: doc.id, ...data };
            completedPromotions.push(promotion);
    
            // Mark as completed in batch
            batch.update(doc.ref, {
              isActive: false,
              status: "completed",
              completedAt: now,
              updatedAt: now,
            });
        }
      });

      // Execute batch update
      await batch.commit();

      // Create next recurrences for recurring promotions
      for (const promotion of completedPromotions) {
        if (promotion.frequency && promotion.frequency !== "once") {
          await this.createNextRecurrence(promotion);
        }
      }

      console.log(`✅ Processed ${completedPromotions.length} completed promotions`);
      return completedPromotions.length;
    } catch (error) {
      console.error("Error processing completed promotions:", error);
      throw error;
    }
  }

  // Execute promotion and update content metrics
  async executePromotion(scheduleId) {
    try {
      const scheduleDoc = await db.collection("promotion_schedules").doc(scheduleId).get();

      if (!scheduleDoc.exists) {
        throw new Error("Schedule not found");
      }

      const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() };

      // Get associated content
      const contentDoc = await db.collection("content").doc(schedule.contentId).get();
      if (!contentDoc.exists) {
        throw new Error("Content not found");
      }

      const content = { id: contentDoc.id, ...contentDoc.data() };

      // Calculate promotion impact based on platform and budget
      const platformMultiplier = this.getPlatformMultiplier(schedule.platform);
      const budgetMultiplier = Math.min(schedule.budget / 1000, 5); // Cap at 5x for $5000 budget

      // Generate realistic metrics based on content type and platform
      const baseViews = this.calculateBaseViews(content.type, schedule.platform);
      const actualViews = Math.floor(
        baseViews * platformMultiplier * budgetMultiplier * (0.8 + Math.random() * 0.4)
      ); // 80-120% variation

      const engagementRate = this.calculateEngagementRate(content.type, schedule.platform);
      const actualEngagements = Math.floor(actualViews * engagementRate);

      // Calculate revenue based on views and RPM
      const rpm = content.target_rpm || 900000; // Revenue per million views
      const revenue = (actualViews / 1000000) * rpm;

      // Update content with new metrics
      const updatedContent = {
        views: (content.views || 0) + actualViews,
        engagements: (content.engagements || 0) + actualEngagements,
        revenue: (content.revenue || 0) + revenue,
        engagementRate:
          ((content.views || 0) * (content.engagementRate || 0) + actualViews * engagementRate) /
          ((content.views || 0) + actualViews),
        lastPromotionDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.collection("content").doc(schedule.contentId).update(updatedContent);

      // Record promotion execution
      const executionRef = db.collection("promotion_executions").doc();
      await executionRef.set({
        scheduleId,
        contentId: schedule.contentId,
        platform: schedule.platform,
        executedAt: new Date().toISOString(),
        viewsGenerated: actualViews,
        engagementsGenerated: actualEngagements,
        revenueGenerated: revenue,
        cost: schedule.budget,
        metrics: {
          views: actualViews,
          engagements: actualEngagements,
          engagementRate,
          revenue,
          costPerView: schedule.budget / actualViews,
          roi: revenue / schedule.budget,
        },
      });

      // TRIGGER REAL PLATFORM POSTING
      try {
        console.log(`🚀 [Integration] Enqueuing real platform task for ${schedule.platform}`);
        const result = await enqueuePlatformPostTask({
            contentId: schedule.contentId,
            uid: schedule.user_id || schedule.uid || "bf04dPKELvVMivWoUyLsAVyw2sg2",
            platform: schedule.platform,
            reason: "scheduled_promotion_" + scheduleId,
            payload: {
                scheduleId: scheduleId
            },
            skipIfDuplicate: true 
        });
        console.log("✅ Task enqueue result:", JSON.stringify(result, null, 2));
      } catch (err) {
          console.error("⚠️ Failed to enqueue real platform task:", err.message);
      }

      // PayPal and Monetization logic skipped due to simulation mode
      console.log(
        `✅ Executed promotion for content ${schedule.contentId}: ${actualViews} views, $${revenue.toFixed(2)} revenue (Simulated + Real Task Enqueued)`
      );

      return {
        scheduleId,
        contentId: schedule.contentId,
        viewsGenerated: actualViews,
        engagementsGenerated: actualEngagements,
        revenueGenerated: revenue,
        paypalOrderId: "skipped",
        paypalCaptureId: "skipped",
        metrics: {
          views: actualViews,
          engagements: actualEngagements,
          engagementRate,
          revenue,
          costPerView: schedule.budget / actualViews,
          roi: revenue / schedule.budget,
        },
      };
    } catch (error) {
      console.error("Error executing promotion:", error);
      throw error;
    }
  }

  // Get platform multiplier for promotion effectiveness
  getPlatformMultiplier(platform) {
    const multipliers = {
      youtube: 1.5,
      tiktok: 2.0,
      instagram: 1.3,
      facebook: 1.1,
      twitter: 1.0,
      linkedin: 0.8,
      pinterest: 0.9,
      all: 1.2,
    };
    return multipliers[platform] || 1.0;
  }

  // Calculate base views based on content type
  calculateBaseViews(contentType, platform) {
    const baseViews = {
      video: 50000,
      image: 30000,
      article: 20000,
      audio: 15000,
    };

    const typeMultiplier = baseViews[contentType] || 25000;
    const platformMultiplier = this.getPlatformMultiplier(platform);

    return Math.floor(typeMultiplier * platformMultiplier);
  }

  // Calculate engagement rate based on content type and platform
  calculateEngagementRate(contentType, platform) {
    const baseRates = {
      video: 0.08,
      image: 0.12,
      article: 0.06,
      audio: 0.04,
    };

    const typeRate = baseRates[contentType] || 0.07;
    const platformAdjustment = platform === "tiktok" ? 0.02 : platform === "instagram" ? 0.01 : 0;

    return Math.max(
      0.02,
      Math.min(0.25, typeRate + platformAdjustment + (Math.random() - 0.5) * 0.04)
    );
  }

  // Get promotion performance analytics
  async getPromotionAnalytics(scheduleId) {
    try {
      const scheduleDoc = await db.collection("promotion_schedules").doc(scheduleId).get();

      if (!scheduleDoc.exists) {
        throw new Error("Schedule not found");
      }

      const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() };

      // Get associated content
      const contentDoc = await db.collection("content").doc(schedule.contentId).get();
      if (contentDoc.exists) {
        schedule.content = { id: contentDoc.id, ...contentDoc.data() };
      }

      // Get execution data
      const executionsSnapshot = await db
        .collection("promotion_executions")
        .where("scheduleId", "==", scheduleId)
        .get();

      let totalViews = 0;
      let totalEngagements = 0;
      let totalRevenue = 0;
      let totalCost = 0;

      executionsSnapshot.forEach(doc => {
        const execution = doc.data();
        totalViews += execution.viewsGenerated || 0;
        totalEngagements += execution.engagementsGenerated || 0;
        totalRevenue += execution.revenueGenerated || 0;
        totalCost += execution.cost || 0;
      });

      const analytics = {
        views: totalViews,
        engagements: totalEngagements,
        engagement_rate: totalViews > 0 ? totalEngagements / totalViews : 0,
        conversion_rate: 0.02, // Placeholder
        revenue: totalRevenue,
        cost: totalCost,
        cost_per_view: totalViews > 0 ? totalCost / totalViews : 0,
        roi: totalCost > 0 ? totalRevenue / totalCost : 0,
        executions_count: executionsSnapshot.size,
      };

      return {
        schedule,
        analytics,
        recommendations: optimizationService.generateOptimizationRecommendations(
          schedule.content,
          analytics
        ),
      };
    } catch (error) {
      console.error("Error getting promotion analytics:", error);
      throw error;
    }
  }

  // Bulk schedule promotions with optimization
  async bulkSchedulePromotions(contentIds, scheduleTemplate) {
    try {
      const results = [];

      for (const contentId of contentIds) {
        try {
          const schedule = await this.schedulePromotion(contentId, scheduleTemplate);
          results.push({ contentId, success: true, schedule });
        } catch (error) {
          results.push({ contentId, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error("Error in bulk scheduling:", error);
      throw error;
    }
  }
}

module.exports = new PromotionService();
