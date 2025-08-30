const express = require('express');
const router = express.Router();
const supabase = require('./supabaseClient');
const authMiddleware = require('./authMiddleware');
const optimizationService = require('./optimizationService');

// Get comprehensive admin analytics overview with advanced metrics
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    // Get all content
    const { data: content, error: contentError } = await supabase
      .from('content')
      .select('*');

    // Get promotion schedules
    const { data: promotionSchedules, error: schedulesError } = await supabase
      .from('promotion_schedules')
      .select('*');

    if (usersError || contentError || schedulesError) {
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    // Calculate analytics
    const totalUsers = users.length;
    const totalContent = content.length;
    
    // Calculate today's metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const newUsersToday = users.filter(user => 
      new Date(user.created_at) >= today
    ).length;

    const newContentToday = content.filter(item => 
      new Date(item.created_at) >= today
    ).length;

    // Calculate views and revenue
    const totalViews = content.reduce((sum, item) => sum + (item.views || 0), 0);
    const totalRevenue = content.reduce((sum, item) => sum + (item.revenue || 0), 0);
    
    const viewsToday = content.filter(item => 
      new Date(item.created_at) >= today
    ).reduce((sum, item) => sum + (item.views || 0), 0);

    const revenueToday = content.filter(item => 
      new Date(item.created_at) >= today
    ).reduce((sum, item) => sum + (item.revenue || 0), 0);

    // Calculate engagement metrics
    const activeUsers = users.filter(user => 
      content.some(item => item.user_id === user.id && item.views > 0)
    ).length;

    const engagementRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    
    // Calculate engagement change (7-day comparison)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const activeUsersLastWeek = users.filter(user => 
      content.some(item => item.user_id === user.id && 
        new Date(item.created_at) >= sevenDaysAgo && item.views > 0)
    ).length;

    const engagementChange = activeUsersLastWeek > 0 ? 
      Math.round(((activeUsers - activeUsersLastWeek) / activeUsersLastWeek) * 100) : 0;

    // Calculate promotions
    const activePromotions = content.filter(item => 
      item.status === 'promoting'
    ).length;

    const promotionsCompleted = content.filter(item => 
      item.status === 'published' && item.revenue > 0
    ).length;

    const scheduledPromotions = promotionSchedules.filter(schedule => 
      schedule.is_active && new Date(schedule.start_time) > new Date()
    ).length;

    // Calculate revenue metrics
    const avgRevenuePerContent = totalContent > 0 ? totalRevenue / totalContent : 0;
    const avgRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    
    // Advanced revenue projection based on historical trends
    const dailyRevenueRate = totalRevenue / 30; // Assuming 30 days of data
    const projectedMonthlyRevenue = dailyRevenueRate * 30;

    // Calculate platform-specific revenue from analytics table
    const { data: platformAnalytics } = await supabase
      .from('analytics')
      .select('platform, revenue')
      .not('platform', 'eq', 'all');

    const revenueByPlatform = {};
    platformAnalytics?.forEach(item => {
      revenueByPlatform[item.platform] = (revenueByPlatform[item.platform] || 0) + (item.revenue || 0);
    });

    // Calculate content performance distribution
    const highPerformingContent = content.filter(item => item.revenue > 100).length;
    const mediumPerformingContent = content.filter(item => item.revenue > 10 && item.revenue <= 100).length;
    const lowPerformingContent = content.filter(item => item.revenue <= 10).length;

    // Calculate user segmentation
    const powerUsers = users.filter(user => 
      content.filter(item => item.user_id === user.id && item.revenue > 50).length > 0
    ).length;

    const activeCreators = users.filter(user => 
      content.some(item => item.user_id === user.id && item.views > 0)
    ).length;

    const inactiveUsers = users.filter(user => 
      !content.some(item => item.user_id === user.id)
    ).length;

    res.json({
      // Basic metrics
      totalUsers,
      totalContent,
      totalViews,
      totalRevenue,
      newUsersToday,
      newContentToday,
      viewsToday,
      revenueToday,
      
      // Engagement metrics
      engagementRate,
      engagementChange,
      activeUsers,
      activeUsersLastWeek,
      
      // Promotion metrics
      activePromotions,
      promotionsCompleted,
      scheduledPromotions,
      
      // Revenue metrics
      avgRevenuePerContent,
      avgRevenuePerUser,
      projectedMonthlyRevenue,
      revenueByPlatform,
      
      // Performance distribution
      contentPerformance: {
        high: highPerformingContent,
        medium: mediumPerformingContent,
        low: lowPerformingContent
      },
      
      // User segmentation
      userSegmentation: {
        powerUsers,
        activeCreators,
        inactiveUsers,
        total: totalUsers
      },
      
      // Platform performance
      platformPerformance: Object.keys(revenueByPlatform).map(platform => ({
        platform,
        revenue: Math.round(revenueByPlatform[platform]),
        percentage: Math.round((revenueByPlatform[platform] / totalRevenue) * 100) || 0
      }))
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users for admin
router.get('/users', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select(`
        *,
        content:content(count)
      `);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Format the response
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      content_count: user.content[0]?.count || 0,
      created_at: user.created_at
    }));

    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all content for admin
router.get('/content', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: content, error } = await supabase
      .from('content')
      .select(`
        *,
        user:users(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch content' });
    }

    // Format the response
    const formattedContent = content.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      user_name: item.user?.name || 'Unknown',
      views: item.views || 0,
      revenue: item.revenue || 0,
      status: item.status || 'draft',
      created_at: item.created_at
    }));

    res.json({ content: formattedContent });
  } catch (error) {
    console.error('Admin content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Advanced analytics endpoints for Phase 3

// Get platform performance analytics
router.get('/platform-performance', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { period = '30d' } = req.query;
    let days = 30;
    if (period === '7d') days = 7;
    if (period === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get platform-specific analytics
    const { data: platformAnalytics, error } = await supabase
      .from('analytics')
      .select('platform, views, revenue, engagement, conversion_rate')
      .gte('metrics_updated_at', startDate.toISOString())
      .not('platform', 'eq', 'all');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch platform analytics' });
    }

    // Aggregate platform performance
    const platformPerformance = {};
    platformAnalytics.forEach(item => {
      if (!platformPerformance[item.platform]) {
        platformPerformance[item.platform] = {
          views: 0,
          revenue: 0,
          engagement: 0,
          conversion_rate: 0,
          count: 0
        };
      }
      platformPerformance[item.platform].views += item.views || 0;
      platformPerformance[item.platform].revenue += item.revenue || 0;
      platformPerformance[item.platform].engagement += item.engagement || 0;
      platformPerformance[item.platform].conversion_rate += item.conversion_rate || 0;
      platformPerformance[item.platform].count++;
    });

    // Calculate averages
    Object.keys(platformPerformance).forEach(platform => {
      const data = platformPerformance[platform];
      if (data.count > 0) {
        data.engagement = data.engagement / data.count;
        data.conversion_rate = data.conversion_rate / data.count;
      }
    });

    res.json({
      period,
      platform_performance: Object.entries(platformPerformance).map(([platform, data]) => ({
        platform,
        views: data.views,
        revenue: data.revenue,
        avg_engagement: data.engagement,
        avg_conversion_rate: data.conversion_rate
      }))
    });
  } catch (error) {
    console.error('Platform performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get revenue trends over time
router.get('/revenue-trends', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { period = '30d' } = req.query;
    let days = 30;
    if (period === '7d') days = 7;
    if (period === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily revenue data
    const { data: revenueData, error } = await supabase
      .from('analytics')
      .select('metrics_updated_at, revenue')
      .gte('metrics_updated_at', startDate.toISOString())
      .order('metrics_updated_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch revenue trends' });
    }

    // Group by date
    const dailyRevenue = {};
    revenueData.forEach(item => {
      const date = new Date(item.metrics_updated_at).toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (item.revenue || 0);
    });

    res.json({
      period,
      revenue_trends: Object.entries(dailyRevenue).map(([date, revenue]) => ({
        date,
        revenue: Math.round(revenue)
      }))
    });
  } catch (error) {
    console.error('Revenue trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user engagement analytics
router.get('/user-engagement', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { period = '30d' } = req.query;
    let days = 30;
    if (period === '7d') days = 7;
    if (period === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get user engagement data
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, created_at');

    const { data: content, error: contentError } = await supabase
      .from('content')
      .select('user_id, views, created_at')
      .gte('created_at', startDate.toISOString());

    if (usersError || contentError) {
      return res.status(500).json({ error: 'Failed to fetch engagement data' });
    }

    // Calculate user engagement metrics
    const userEngagement = users.map(user => {
      const userContent = content.filter(item => item.user_id === user.id);
      const totalViews = userContent.reduce((sum, item) => sum + (item.views || 0), 0);
      const contentCount = userContent.length;
      
      return {
        user_id: user.id,
        content_count: contentCount,
        total_views: totalViews,
        avg_views_per_content: contentCount > 0 ? Math.round(totalViews / contentCount) : 0,
        engagement_score: Math.min(100, Math.round((totalViews / 1000) + (contentCount * 10)))
      };
    });

    res.json({
      period,
      user_engagement: userEngagement.sort((a, b) => b.engagement_score - a.engagement_score)
    });
  } catch (error) {
    console.error('User engagement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get optimization recommendations for platform
router.get('/optimization-recommendations', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: content, error } = await supabase
      .from('content')
      .select('*')
      .order('revenue', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch content for optimization' });
    }

    // Generate optimization recommendations for top content
    const recommendations = [];
    content.forEach(item => {
      const contentRecommendations = optimizationService.generateOptimizationRecommendations(item);
      recommendations.push({
        content_id: item.id,
        title: item.title,
        current_revenue: item.revenue || 0,
        recommendations: contentRecommendations
      });
    });

    res.json({
      total_recommendations: recommendations.reduce((sum, item) => sum + item.recommendations.length, 0),
      recommendations: recommendations.filter(item => item.recommendations.length > 0)
    });
  } catch (error) {
    console.error('Optimization recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get promotion performance analytics
router.get('/promotion-performance', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: promotions, error: promotionsError } = await supabase
      .from('promotion_schedules')
      .select('*, content:content_id(title, revenue, views)');

    const { data: content, error: contentError } = await supabase
      .from('content')
      .select('id, revenue, views, promotion_started_at')
      .not('promotion_started_at', 'is', null);

    if (promotionsError || contentError) {
      return res.status(500).json({ error: 'Failed to fetch promotion data' });
    }

    // Calculate promotion performance metrics
    const activePromotions = promotions.filter(p => p.is_active).length;
    const completedPromotions = promotions.filter(p => !p.is_active).length;
    
    const promotedContent = content.filter(item => item.promotion_started_at);
    const totalRevenueFromPromotions = promotedContent.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const totalViewsFromPromotions = promotedContent.reduce((sum, item) => sum + (item.views || 0), 0);

    const avgROI = promotedContent.length > 0 ? 
      totalRevenueFromPromotions / (promotions.reduce((sum, p) => sum + (p.budget || 0), 0) || 1) : 0;

    res.json({
      promotion_metrics: {
        active_promotions: activePromotions,
        completed_promotions: completedPromotions,
        total_promotions: promotions.length,
        total_revenue_from_promotions: totalRevenueFromPromotions,
        total_views_from_promotions: totalViewsFromPromotions,
        avg_roi: avgROI,
        promotion_success_rate: promotions.length > 0 ? 
          Math.round((completedPromotions / promotions.length) * 100) : 0
      },
      top_performing_promotions: promotions
        .filter(p => p.content && p.content.revenue > 0)
        .sort((a, b) => (b.content?.revenue || 0) - (a.content?.revenue || 0))
        .slice(0, 10)
        .map(p => ({
          promotion_id: p.id,
          content_title: p.content?.title || 'Unknown',
          platform: p.platform,
          budget: p.budget,
          revenue: p.content?.revenue || 0,
          views: p.content?.views || 0,
          roi: p.budget > 0 ? ((p.content?.revenue || 0) / p.budget) : 0
        }))
    });
  } catch (error) {
    console.error('Promotion performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
