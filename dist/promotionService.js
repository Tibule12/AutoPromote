const { db } = require('./firebaseAdmin');
const optimizationService = require('./optimizationService');

class PromotionService {
    // Schedule a promotion for content with advanced algorithms
  async schedulePromotion(contentId, scheduleData) {
    try {
      console.log(`📊 Scheduling promotion for content ID: ${contentId}`);
      console.log('📋 Schedule data:', scheduleData);
      
      // Get content details for optimization
      const contentRef = db.collection('content').doc(contentId);
      const contentDoc = await contentRef.get();

      if (!contentDoc.exists) {
        const error = new Error('Content not found');
        console.error('❌ Error fetching content:', error);
        throw error;
      }

      const content = { id: contentDoc.id, ...contentDoc.data() };

      // Apply platform-specific optimization if not specified
      let optimizedScheduleData = { ...scheduleData };
      if (!scheduleData.platform_specific_settings && scheduleData.platform) {
        optimizedScheduleData.platform_specific_settings = 
          this.optimizePlatformSettings(content, scheduleData.platform, scheduleData);
      }

      // Calculate optimal budget if not specified
      if (!scheduleData.budget && content) {
        optimizedScheduleData.budget = optimizationService.calculateOptimalBudget(
          content, 
          { platform: scheduleData.platform || 'all' }
        );
      }

      // Create new promotion schedule in Firestore
      const scheduleRef = db.collection('promotion_schedules').doc();
      const promotionScheduleData = {
        contentId,
        platform: optimizedScheduleData.platform,
        scheduleType: optimizedScheduleData.schedule_type || 'specific',
        startTime: optimizedScheduleData.start_time,
        endTime: optimizedScheduleData.end_time,
        frequency: optimizedScheduleData.frequency,
        isActive: optimizedScheduleData.is_active !== false,
        budget: optimizedScheduleData.budget || 0,
        targetMetrics: optimizedScheduleData.target_metrics || {},
        platformSpecificSettings: optimizedScheduleData.platform_specific_settings || {},
        recurrencePattern: optimizedScheduleData.recurrence_pattern,
        maxOccurrences: optimizedScheduleData.max_occurrences,
        timezone: optimizedScheduleData.timezone || 'UTC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await scheduleRef.set(promotionScheduleData);
      const newSchedule = { id: scheduleRef.id, ...promotionScheduleData };
      console.log('✅ Promotion scheduled successfully:', newSchedule);
      
      // If this is a recurring schedule, create the next occurrence
      if (optimizedScheduleData.frequency && optimizedScheduleData.frequency !== 'once') {
        await this.createNextRecurrence(newSchedule);
      }
      
      return newSchedule;
    } catch (error) {
      console.error('❌ Error scheduling promotion:', error);
      console.error('📋 Error stack:', error.stack);
      throw error;
    }
  }

  // Optimize platform-specific settings
  optimizePlatformSettings(content, platform, scheduleData) {
    const settings = {};
    
    switch (platform) {
      case 'youtube':
        settings.optimal_time = '15:00-17:00';
        settings.target_cpm = optimizationService.calculateOptimalRPM(content.type, 'youtube') / 1000;
        settings.audience_targeting = ['related_content', 'demographic'];
        break;
      case 'tiktok':
        settings.optimal_time = '19:00-21:00';
        settings.hashtag_strategy = 'trending';
        settings.video_length = '15-60s';
        break;
      case 'instagram':
        settings.optimal_time = '11:00-13:00,19:00-21:00';
        settings.story_duration = '24h';
        settings.carousel_slides = 3;
        break;
      case 'facebook':
        settings.optimal_time = '09:00-11:00,13:00-15:00';
        settings.boost_duration = '7d';
        settings.targeting = ['interests', 'location'];
        break;
      default:
        settings.optimal_time = '12:00-14:00';
    }

    return settings;
  }

  // Create next recurrence for a promotion schedule
  async createNextRecurrence(schedule) {
    try {
      const nextTime = this.calculateNextPromotionTime(
        schedule.start_time, 
        schedule.frequency,
        schedule.recurrence_pattern
      );

      if (!nextTime) return null;

      const nextSchedule = {
        content_id: schedule.content_id,
        platform: schedule.platform,
        schedule_type: schedule.schedule_type,
        start_time: nextTime,
        frequency: schedule.frequency,
        is_active: schedule.is_active,
        budget: schedule.budget,
        target_metrics: schedule.target_metrics,
        platform_specific_settings: schedule.platform_specific_settings,
        recurrence_pattern: schedule.recurrence_pattern,
        parent_schedule_id: schedule.id,
        timezone: schedule.timezone
      };

      // Check max occurrences
      if (schedule.max_occurrences) {
        const occurrenceCount = await this.getOccurrenceCount(schedule.id);
        if (occurrenceCount >= schedule.max_occurrences) {
          console.log(`⏹️ Max occurrences (${schedule.max_occurrences}) reached for schedule ${schedule.id}`);
          return null;
        }
      }

      const { data, error } = await supabase
        .from('promotion_schedules')
        .insert([nextSchedule])
        .select();

      if (error) {
        console.error('Error creating next recurrence:', error);
        return null;
      }

      console.log(`✅ Created next recurrence for schedule ${schedule.id}:`, data[0]);
      return data[0];
    } catch (error) {
      console.error('Error in createNextRecurrence:', error);
      return null;
    }
  }

  // Get occurrence count for a schedule
  async getOccurrenceCount(scheduleId) {
    try {
      const snapshot = await db.collection('promotion_schedules')
        .where('id', '==', scheduleId)
        .get();

      const recurrencesSnapshot = await db.collection('promotion_schedules')
        .where('parentScheduleId', '==', scheduleId)
        .get();

      return snapshot.size + recurrencesSnapshot.size;
    } catch (error) {
      console.error('Error getting occurrence count:', error);
      return 0;
    }
  }

  // Get all promotion schedules for content
  async getContentPromotionSchedules(contentId) {
    try {
      const snapshot = await db.collection('promotion_schedules')
        .where('contentId', '==', contentId)
        .orderBy('startTime')
        .get();

      const schedules = [];
      snapshot.forEach(doc => {
        schedules.push({ id: doc.id, ...doc.data() });
      });

      return schedules;
    } catch (error) {
      console.error('Error getting promotion schedules:', error);
      throw error;
    }
  }

  // Update promotion schedule
  async updatePromotionSchedule(scheduleId, updates) {
    try {
      const scheduleRef = db.collection('promotion_schedules').doc(scheduleId);
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await scheduleRef.update(updateData);
      const updatedDoc = await scheduleRef.get();
      
      if (!updatedDoc.exists) {
        throw new Error('Schedule not found after update');
      }

      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      console.error('Error updating promotion schedule:', error);
      throw error;
    }
  }

  // Delete promotion schedule and its recurrences
  async deletePromotionSchedule(scheduleId) {
    try {
      // First get all recurrences
      const recurrencesSnapshot = await db.collection('promotion_schedules')
        .where('parentScheduleId', '==', scheduleId)
        .get();

      // Delete recurrences in a batch
      const batch = db.batch();
      recurrencesSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Add main schedule deletion to batch
      const scheduleRef = db.collection('promotion_schedules').doc(scheduleId);
      batch.delete(scheduleRef);

      // Execute the batch
      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error('Error deleting promotion schedule:', error);
      throw error;
    }
  }

  // Get active promotions with advanced filtering
  async getActivePromotions(filters = {}) {
    try {
      let query = db.collection('promotion_schedules')
        .where('isActive', '==', true)
        .where('startTime', '<=', new Date().toISOString())
        .orderBy('startTime');

      // Apply filters
      if (filters.platform) {
        query = query.where('platform', '==', filters.platform);
      }
      if (filters.minBudget) {
        query = query.where('budget', '>=', filters.minBudget);
      }
      if (filters.maxBudget) {
        query = query.where('budget', '<=', filters.maxBudget);
      }

      const snapshot = await query.get();
      const promotions = [];

      // Get all promotions
      for (const doc of snapshot.docs) {
        const promotion = { id: doc.id, ...doc.data() };
        
        // Get associated content
        const contentDoc = await db.collection('content').doc(promotion.contentId).get();
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
      console.error('Error getting active promotions:', error);
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
      case 'hourly':
        nextTime.setHours(start.getHours() + 1);
        break;
      case 'daily':
        nextTime.setDate(start.getDate() + 1);
        break;
      case 'weekly':
        nextTime.setDate(start.getDate() + 7);
        break;
      case 'biweekly':
        nextTime.setDate(start.getDate() + 14);
        break;
      case 'monthly':
        nextTime.setMonth(start.getMonth() + 1);
        break;
      case 'quarterly':
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
    
    if (pattern.type === 'custom') {
      switch (pattern.unit) {
        case 'days':
          date.setDate(date.getDate() + pattern.interval);
          break;
        case 'weeks':
          date.setDate(date.getDate() + (pattern.interval * 7));
          break;
        case 'months':
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
      
      // Get promotions that have ended
      const snapshot = await db.collection('promotion_schedules')
        .where('isActive', '==', true)
        .where('endTime', '<=', now)
        .get();

      const batch = db.batch();
      const completedPromotions = [];

      snapshot.forEach(doc => {
        const promotion = { id: doc.id, ...doc.data() };
        completedPromotions.push(promotion);

        // Mark as completed in batch
        batch.update(doc.ref, { 
          isActive: false,
          status: 'completed',
          completedAt: now,
          updatedAt: now
        });
      });

      // Execute batch update
      await batch.commit();

      // Create next recurrences for recurring promotions
      for (const promotion of completedPromotions) {
        if (promotion.frequency && promotion.frequency !== 'once') {
          await this.createNextRecurrence(promotion);
        }
      }

      console.log(`✅ Processed ${completedPromotions.length} completed promotions`);
      return completedPromotions.length;
    } catch (error) {
      console.error('Error processing completed promotions:', error);
      throw error;
    }
  }

  // Get promotion performance analytics
  async getPromotionAnalytics(scheduleId) {
    try {
      const scheduleDoc = await db.collection('promotion_schedules').doc(scheduleId).get();
      
      if (!scheduleDoc.exists) {
        throw new Error('Schedule not found');
      }

      const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() };

      // Get associated content
      const contentDoc = await db.collection('content').doc(schedule.contentId).get();
      if (contentDoc.exists) {
        schedule.content = { id: contentDoc.id, ...contentDoc.data() };
      }

      // Simulate analytics data (in real implementation, this would come from actual analytics)
      const analytics = {
        views: Math.floor(Math.random() * 1000000) + 50000,
        engagement_rate: Math.random() * 0.2 + 0.05,
        conversion_rate: Math.random() * 0.1 + 0.01,
        revenue: Math.floor(Math.random() * 1000) + 100,
        cost_per_view: Math.random() * 0.1 + 0.01,
        roi: Math.random() * 3 + 0.5
      };

      return {
        schedule,
        analytics,
        recommendations: optimizationService.generateOptimizationRecommendations(schedule.content, analytics)
      };
    } catch (error) {
      console.error('Error getting promotion analytics:', error);
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
      console.error('Error in bulk scheduling:', error);
      throw error;
    }
  }
}

module.exports = new PromotionService();
