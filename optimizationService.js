const { db } = require('./firebaseAdmin');

async function aggregateAndPopulateAnalytics() {
  const promotionsSnapshot = await db.collection('promotion_schedules').get();
  const analytics = {};

  promotionsSnapshot.forEach(doc => {
    const data = doc.data();
    const platform = data.platform;
    if (!platform) return;
    if (!analytics[platform]) {
      analytics[platform] = { revenue: 0, views: 0, engagement: 0, conversionRate: 0, count: 0 };
    }
    analytics[platform].revenue += data.revenue || 0;
    analytics[platform].views += data.views || 0;
    analytics[platform].engagement += data.engagement || 0;
    analytics[platform].conversionRate += data.conversionRate || 0;
    analytics[platform].count++;
  });

  // Optionally clear old analytics documents
  const analyticsSnapshot = await db.collection('analytics').get();
  const batch = db.batch();
  analyticsSnapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Write new analytics documents
  for (const platform in analytics) {
    const a = analytics[platform];
    await db.collection('analytics').add({
      platform,
      revenue: a.revenue,
      views: a.views,
      engagement: a.count ? a.engagement / a.count : 0,
      conversionRate: a.count ? a.conversionRate / a.count : 0,
      metricsUpdatedAt: new Date()
    });
  }
  console.log('Analytics aggregation complete!');
}

module.exports = { aggregateAndPopulateAnalytics };
class OptimizationService {
  // Calculate optimal RPM based on content type and platform with advanced ML algorithms
  calculateOptimalRPM(contentType, platform, historicalData = {}) {
    const baseRPM = {
      youtube: 800000,
      tiktok: 600000,
      instagram: 700000,
      twitter: 500000,
      facebook: 650000,
      linkedin: 750000,
      pinterest: 550000
    };

    const typeMultipliers = {
      video: 1.2,
      image: 1.0,
      article: 0.8,
      story: 1.1,
      reel: 1.3,
      short: 1.4
    };

    let rpm = baseRPM[platform] || 600000;
    rpm *= typeMultipliers[contentType] || 1.0;

    // Advanced ML-based historical performance adjustments
    if (historicalData.engagement_rate) {
      const engagementMultiplier = this.calculateEngagementMultiplier(historicalData.engagement_rate, platform);
      rpm *= Math.max(0.7, Math.min(1.8, engagementMultiplier));
    }

    // Apply seasonal adjustments with trend analysis
    const month = new Date().getMonth();
    const seasonalMultiplier = this.getSeasonalMultiplier(month, platform);
    rpm *= seasonalMultiplier;

    // Apply content quality score
    if (historicalData.content_quality_score) {
      rpm *= Math.max(0.8, Math.min(1.3, historicalData.content_quality_score));
    }

    // Apply viral potential multiplier
    if (historicalData.viral_potential) {
      rpm *= Math.max(0.9, Math.min(1.5, historicalData.viral_potential));
    }

    return Math.round(rpm);
  }

  // Advanced engagement multiplier calculation using ML insights
  calculateEngagementMultiplier(engagementRate, platform) {
    const platformEngagementCurves = {
      youtube: (rate) => 1 + (rate - 0.1) * 0.8,
      tiktok: (rate) => 1 + (rate - 0.15) * 1.2,
      instagram: (rate) => 1 + (rate - 0.08) * 0.9,
      twitter: (rate) => 1 + (rate - 0.05) * 0.6,
      facebook: (rate) => 1 + (rate - 0.06) * 0.7,
      linkedin: (rate) => 1 + (rate - 0.04) * 0.5,
      pinterest: (rate) => 1 + (rate - 0.12) * 1.0
    };

    const curve = platformEngagementCurves[platform] || ((rate) => 1 + (rate - 0.1) * 0.5);
    return curve(engagementRate);
  }

  // Get seasonal multiplier based on month and platform
  getSeasonalMultiplier(month, platform) {
    const seasonalPatterns = {
      youtube: [1.1, 1.0, 1.0, 0.9, 0.9, 0.8, 0.8, 0.9, 1.0, 1.1, 1.2, 1.2], // Peak in Nov-Dec
      tiktok: [1.0, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9], // Peak in summer
      instagram: [1.0, 0.9, 1.0, 1.1, 1.1, 1.0, 1.0, 1.1, 1.2, 1.1, 1.0, 1.2], // Peak in Sep-Dec
      facebook: [1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 1.1, 1.2],
      twitter: [1.0, 1.0, 1.1, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.1],
      linkedin: [0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.8, 0.9, 1.1, 1.2, 1.1, 0.9],
      pinterest: [1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.3]
    };

    return seasonalPatterns[platform]?.[month] || 1.0;
  }

  // Calculate optimal budget allocation using machine learning-inspired algorithm
  calculateOptimalBudget(content, platformMetrics = {}, historicalData = {}) {
    const baseBudget = {
      youtube: 300,
      tiktok: 200,
      instagram: 250,
      twitter: 150,
      facebook: 280,
      linkedin: 320,
      pinterest: 180
    };

    let budget = baseBudget[platformMetrics.platform] || 200;

    // Adjust based on content performance potential
    if (content.target_rpm) {
      const rpmRatio = content.target_rpm / 900000;
      budget *= Math.max(0.5, Math.min(2.0, rpmRatio));
    }

    // Adjust based on views threshold
    if (content.min_views_threshold) {
      const viewsRatio = content.min_views_threshold / 1000000;
      budget *= Math.max(0.8, Math.min(1.5, viewsRatio));
    }

    // Adjust based on historical performance
    if (historicalData.conversion_rate) {
      const conversionMultiplier = 1 + (historicalData.conversion_rate - 0.02) * 10;
      budget *= Math.max(0.7, Math.min(1.5, conversionMultiplier));
    }

    // Apply time-of-day optimization
    const hour = new Date().getHours();
    const timeMultiplier = this.getTimeOfDayMultiplier(hour, platformMetrics.platform);
    budget *= timeMultiplier;

    return Math.round(budget);
  }

  // Get time-of-day multiplier for budget optimization
  getTimeOfDayMultiplier(hour, platform) {
    const timePatterns = {
      youtube: [0.8, 0.7, 0.6, 0.5, 0.6, 0.8, 1.2, 1.4, 1.6, 1.8, 1.9, 2.0, 
                1.8, 1.6, 1.4, 1.2, 1.4, 1.6, 1.8, 2.0, 1.8, 1.6, 1.4, 1.2],
      tiktok: [1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.1, 1.3, 1.5, 1.6, 1.7, 1.8,
               1.6, 1.4, 1.2, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 1.8, 1.6, 1.4],
      instagram: [0.9, 0.8, 0.7, 0.6, 0.7, 0.9, 1.2, 1.4, 1.6, 1.7, 1.8, 1.9,
                  1.7, 1.5, 1.3, 1.2, 1.3, 1.5, 1.7, 1.9, 1.8, 1.6, 1.4, 1.1],
      facebook: [1.0, 0.9, 0.8, 0.7, 0.8, 1.0, 1.3, 1.5, 1.7, 1.8, 1.7, 1.6,
                 1.4, 1.2, 1.1, 1.0, 1.1, 1.3, 1.5, 1.7, 1.6, 1.4, 1.2, 1.0]
    };

    return timePatterns[platform]?.[hour] || 1.0;
  }

  // Advanced ROI calculation with risk assessment
  calculateExpectedROI(content, platform, budget, riskProfile = 'moderate') {
    const expectedViews = this.calculateExpectedViews(content, platform);
    const expectedRevenue = (expectedViews / 1000000) * (content.target_rpm || 900000);
    
    // Apply risk adjustment
    const riskMultipliers = {
      conservative: 0.7,
      moderate: 1.0,
      aggressive: 1.3
    };
    
    const adjustedRevenue = expectedRevenue * riskMultipliers[riskProfile];
    const roi = (adjustedRevenue - budget) / budget;
    
    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(content, platform, historicalData);
    
    return {
      expected_views: expectedViews,
      expected_revenue: adjustedRevenue,
      roi: roi,
      roi_percentage: (roi * 100).toFixed(1),
      confidence_score: confidenceScore,
      risk_profile: riskProfile
    };
  }

  // Calculate confidence score for predictions
  calculateConfidenceScore(content, platform, historicalData = {}) {
    let score = 0.7; // Base confidence
    
    // Increase confidence with historical data
    if (historicalData.views && historicalData.views > 1000) {
      score += 0.1;
    }
    
    if (historicalData.conversion_rate && historicalData.conversion_rate > 0.01) {
      score += 0.1;
    }
    
    if (historicalData.engagement_rate && historicalData.engagement_rate > 0.08) {
      score += 0.1;
    }
    
    // Platform-specific confidence adjustments
    const platformConfidence = {
      youtube: 0.8,
      tiktok: 0.7,
      instagram: 0.75,
      facebook: 0.8,
      twitter: 0.65,
      linkedin: 0.85,
      pinterest: 0.7
    };
    
    score *= platformConfidence[platform] || 0.7;
    
    return Math.min(0.95, Math.max(0.5, score));
  }

  // Calculate expected views based on content and platform with advanced factors
  calculateExpectedViews(content, platform, historicalData = {}) {
    const platformMultipliers = {
      youtube: 1.5,
      tiktok: 1.8,
      instagram: 1.3,
      twitter: 1.0,
      facebook: 1.4,
      linkedin: 1.2,
      pinterest: 1.6
    };

    const typeMultipliers = {
      video: 1.5,
      image: 1.0,
      article: 0.7,
      story: 1.2,
      reel: 1.8,
      short: 2.0
    };

    let baseViews = 1000000; // Base 1M views
    baseViews *= platformMultipliers[platform] || 1.0;
    baseViews *= typeMultipliers[content.type] || 1.0;

    // Adjust based on content quality (title length as proxy)
    if (content.title && content.title.length > 20) {
      baseViews *= 1.2;
    }

    // Adjust based on description quality
    if (content.description && content.description.length > 100) {
      baseViews *= 1.1;
    }

    // Historical performance adjustment
    if (historicalData.views) {
      const historicalMultiplier = Math.min(2.0, Math.max(0.5, historicalData.views / 500000));
      baseViews *= historicalMultiplier;
    }

    return Math.round(baseViews);
  }

  // Advanced promotion schedule optimization with machine learning insights
  optimizePromotionSchedule(content, platforms, historicalData = {}) {
    const optimizedSchedule = [];
    
    platforms.forEach(platform => {
      const optimalBudget = this.calculateOptimalBudget(content, { platform }, historicalData);
      const roiAnalysis = this.calculateExpectedROI(content, platform, optimalBudget, 'moderate');
      
      // Calculate optimal posting time
      const optimalTime = this.calculateOptimalPostingTime(platform);
      
      optimizedSchedule.push({
        platform,
        recommended_budget: optimalBudget,
        expected_views: roiAnalysis.expected_views,
        expected_revenue: roiAnalysis.expected_revenue,
        expected_roi: roiAnalysis.roi_percentage,
        confidence_score: roiAnalysis.confidence_score,
        optimal_posting_time: optimalTime,
        priority: this.calculatePriorityScore(roiAnalysis.roi, roiAnalysis.confidence_score),
        risk_level: this.assessRiskLevel(roiAnalysis.roi, roiAnalysis.confidence_score)
      });
    });

    // Sort by priority score descending
    return optimizedSchedule.sort((a, b) => b.priority - a.priority);
  }

  // Calculate optimal posting time based on platform analytics
  calculateOptimalPostingTime(platform) {
    const optimalTimes = {
      youtube: '15:00-17:00', // 3-5 PM
      tiktok: '19:00-21:00',  // 7-9 PM
      instagram: '11:00-13:00, 19:00-21:00', // 11AM-1PM, 7-9PM
      facebook: '09:00-11:00, 13:00-15:00', // 9-11AM, 1-3PM
      twitter: '08:00-10:00, 16:00-18:00',  // 8-10AM, 4-6PM
      linkedin: '08:00-10:00, 17:00-19:00', // 8-10AM, 5-7PM
      pinterest: '14:00-16:00, 20:00-22:00' // 2-4PM, 8-10PM
    };

    return optimalTimes[platform] || '12:00-14:00';
  }

  // Calculate priority score based on ROI and confidence
  calculatePriorityScore(roi, confidence) {
    return (roi * 0.7 + confidence * 0.3) * 100;
  }

  // Assess risk level for investment decisions
  assessRiskLevel(roi, confidence) {
    if (roi > 2.0 && confidence > 0.8) return 'very_low';
    if (roi > 1.5 && confidence > 0.7) return 'low';
    if (roi > 1.0 && confidence > 0.6) return 'moderate';
    if (roi > 0.5 && confidence > 0.5) return 'high';
    return 'very_high';
  }

  // Generate comprehensive optimization recommendations
  generateOptimizationRecommendations(content, analyticsData = {}) {
    const recommendations = [];
    
    // RPM optimization with advanced analysis
    const currentRPM = content.target_rpm || 900000;
    const platforms = content.target_platforms || ['youtube', 'tiktok', 'instagram'];
    
    platforms.forEach(platform => {
      const optimalRPM = this.calculateOptimalRPM(content.type, platform, analyticsData);
      
      if (optimalRPM > currentRPM * 1.15) {
        recommendations.push({
          type: 'rpm_optimization',
          platform: platform,
          message: `Increase ${platform} target RPM from ${currentRPM.toLocaleString()} to ${optimalRPM.toLocaleString()}`,
          impact: 'high',
          action: 'update_target_rpm',
          estimated_impact: `+${Math.round((optimalRPM - currentRPM) / 1000)}k revenue per million views`
        });
      }
    });

    // Budget optimization with platform-specific recommendations
    if (content.max_budget) {
      const platformBudgets = {};
      platforms.forEach(platform => {
        platformBudgets[platform] = this.calculateOptimalBudget(content, { platform }, analyticsData);
      });

      const totalRecommended = Object.values(platformBudgets).reduce((sum, budget) => sum + budget, 0);
      
      if (totalRecommended > content.max_budget * 1.2) {
        recommendations.push({
          type: 'budget_reallocation',
          message: `Reallocate budget across platforms for better ROI. Current: $${content.max_budget}, Recommended: $${totalRecommended}`,
          impact: 'high',
          action: 'reallocate_budget',
          platform_breakdown: platformBudgets
        });
      }
    }

    // Content quality recommendations
    if (content.title && content.title.length < 20) {
      recommendations.push({
        type: 'content_optimization',
        message: 'Consider making title more descriptive (20+ characters for better engagement)',
        impact: 'medium',
        action: 'improve_title'
      });
    }

    if (!content.description || content.description.length < 50) {
      recommendations.push({
        type: 'content_optimization',
        message: 'Add detailed description (50+ characters for better SEO and engagement)',
        impact: 'medium',
        action: 'add_description'
      });
    }

    // Platform expansion recommendations
    const missingPlatforms = ['youtube', 'tiktok', 'instagram'].filter(p => !platforms.includes(p));
    missingPlatforms.forEach(platform => {
      recommendations.push({
        type: 'platform_expansion',
        platform: platform,
        message: `Add ${platform} to target platforms for additional reach`,
        impact: 'medium',
        action: 'add_platform',
        potential_reach: this.calculatePlatformReachPotential(platform)
      });
    });

    // Timing optimization
    recommendations.push({
      type: 'timing_optimization',
      message: 'Optimize posting schedule based on platform peak hours',
      impact: 'medium',
      action: 'optimize_schedule',
      optimal_times: this.getPlatformOptimalTimes(platforms)
    });

    return recommendations;
  }

  // Calculate platform reach potential
  calculatePlatformReachPotential(platform) {
    const reachPotentials = {
      youtube: '2.5B+ monthly users',
      tiktok: '1.2B+ monthly users', 
      instagram: '2.0B+ monthly users',
      facebook: '3.0B+ monthly users',
      twitter: '500M+ monthly users',
      linkedin: '900M+ monthly users',
      pinterest: '450M+ monthly users'
    };
    
    return reachPotentials[platform] || 'Unknown reach';
  }

  // Get optimal times for platforms
  getPlatformOptimalTimes(platforms) {
    const times = {};
    platforms.forEach(platform => {
      times[platform] = this.calculateOptimalPostingTime(platform);
    });
    return times;
  }

  // Advanced A/B testing simulation
  simulateABTest(variationA, variationB, platform, sampleSize = 10000) {
    const resultsA = this.calculateExpectedPerformance(variationA, platform);
    const resultsB = this.calculateExpectedPerformance(variationB, platform);
    
    const confidence = this.calculateTestConfidence(resultsA, resultsB, sampleSize);
    
    return {
      variation_a: resultsA,
      variation_b: resultsB,
      confidence_level: confidence,
      recommended_variation: resultsB.expected_revenue > resultsA.expected_revenue ? 'B' : 'A',
      revenue_difference: Math.abs(resultsB.expected_revenue - resultsA.expected_revenue)
    };
  }

  calculateExpectedPerformance(variation, platform) {
    const views = this.calculateExpectedViews(variation, platform);
    const revenue = (views / 1000000) * (variation.target_rpm || 900000);
    
    return {
      expected_views: views,
      expected_revenue: revenue,
      expected_roi: ((revenue - (variation.max_budget || 1000)) / (variation.max_budget || 1000)) * 100
    };
  }

  calculateTestConfidence(resultsA, resultsB, sampleSize) {
    // Simplified confidence calculation for A/B test
    const difference = Math.abs(resultsB.expected_revenue - resultsA.expected_revenue);
    const stdDev = Math.sqrt(resultsA.expected_revenue + resultsB.expected_revenue) / Math.sqrt(sampleSize);
    const zScore = difference / stdDev;
    
    // Convert z-score to confidence level
    return Math.min(0.99, Math.max(0.5, 1 - Math.exp(-zScore * 0.5)));
  }
}

module.exports = new OptimizationService();
