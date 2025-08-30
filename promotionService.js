const supabase = require('./supabaseClient');
const optimizationService = require('./optimizationService');

class PromotionService {
  // Schedule a promotion for content with advanced algorithms
  async schedulePromotion(contentId, scheduleData) {
    try {
      console.log(`📊 Scheduling promotion for content ID: ${contentId}`);
      console.log('📋 Schedule data:', scheduleData);
      
      // Get content details for optimization
      const { data: content, error: contentError } = await supabase
        .from('content')
        .select('*')
        .eq('id', contentId)
        .single();

      if (contentError) {
        console.error('❌ Error fetching content:', contentError);
        throw contentError;
      }

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

      const { data, error } = await supabase
        .from('promotion_schedules')
        .insert([
          {
            content_id: contentId,
            platform: optimizedScheduleData.platform,
            schedule_type: optimizedScheduleData.schedule_type || 'specific',
            start_time: optimizedScheduleData.start_time,
            end_time: optimizedScheduleData.end_time,
            frequency: optimizedScheduleData.frequency,
            is_active: optimizedScheduleData.is_active !== false,
            budget: optimizedScheduleData.budget || 0,
            target_metrics: optimizedScheduleData.target_metrics || {},
            platform_specific_settings: optimizedScheduleData.platform_specific_settings || {},
            recurrence_pattern: optimizedScheduleData.recurrence_pattern,
            max_occurrences: optimizedScheduleData.max_occurrences,
            timezone: optimizedScheduleData.timezone || 'UTC'
          }
        ])
        .select();

      if (error) {
        console.error('❌ Supabase insert error:', error);
        console.error('📋 Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log('✅ Promotion scheduled successfully:', data[0]);
      
      // If this is a recurring schedule, create the next occurrence
      if (optimizedScheduleData.frequency && optimizedScheduleData.frequency !== 'once') {
        await this.createNextRecurrence(data[0]);
      }
      
      return data[0];
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
    const { count, error } = await supabase
      .from('promotion_schedules')
      .select('*', { count: 'exact' })
      .or(`id.eq.${scheduleId},parent_schedule_id.eq.${scheduleId}`);

    if (error) {
      console.error('Error getting occurrence count:', error);
      return 0;
    }

    return count;
  }

  // Get all promotion schedules for content
  async getContentPromotionSchedules(contentId) {
    try {
      const { data, error } = await supabase
        .from('promotion_schedules')
        .select('*')
        .eq('content_id', contentId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting promotion schedules:', error);
      throw error;
    }
  }

  // Update promotion schedule
  async updatePromotionSchedule(scheduleId, updates) {
    try {
      const { data, error } = await supabase
        .from('promotion_schedules')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduleId)
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error updating promotion schedule:', error);
      throw error;
    }
  }

  // Delete promotion schedule and its recurrences
  async deletePromotionSchedule(scheduleId) {
    try {
      // First delete all recurrences
      const { error: recurrencesError } = await supabase
        .from('promotion_schedules')
        .delete()
        .eq('parent_schedule_id', scheduleId);

      if (recurrencesError) {
        console.error('Error deleting recurrences:', recurrencesError);
      }

      // Then delete the main schedule
      const { error } = await supabase
        .from('promotion_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error deleting promotion schedule:', error);
      throw error;
    }
  }

  // Get active promotions with advanced filtering
  async getActivePromotions(filters = {}) {
    try {
      let query = supabase
        .from('promotion_schedules')
        .select('*, content:content_id(*)')
        .eq('is_active', true)
        .lte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      // Apply filters
      if (filters.platform) {
        query = query.eq('platform', filters.platform);
      }
      if (filters.content_type) {
        query = query.eq('content.type', filters.content_type);
      }
      if (filters.min_budget) {
        query = query.gte('budget', filters.min_budget);
      }
      if (filters.max_budget) {
        query = query.lte('budget', filters.max_budget);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
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
      const { data: completedPromotions, error } = await supabase
        .from('promotion_schedules')
        .select('*')
        .lte('end_time', now)
        .eq('is_active', true);

      if (error) throw error;

      for (const promotion of completedPromotions) {
        // Mark as completed
        await supabase
          .from('promotion_schedules')
          .update({ 
            is_active: false,
            status: 'completed',
            completed_at: now 
          })
          .eq('id', promotion.id);

        // Create next recurrence for recurring promotions
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
      const { data: schedule, error: scheduleError } = await supabase
        .from('promotion_schedules')
        .select('*, content:content_id(*)')
        .eq('id', scheduleId)
        .single();

      if (scheduleError) throw scheduleError;

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
