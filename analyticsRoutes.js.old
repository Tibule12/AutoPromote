const express = require('express');
const supabase = require('./supabaseClient');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Get overall platform analytics
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    // Get total content count
    const { count: totalContent, error: contentError } = await supabase
      .from('content')
      .select('*', { count: 'exact' })
      .eq('user_id', req.userId);

    // Get total views
    const { data: viewsData, error: viewsError } = await supabase
      .from('content')
      .select('views')
      .eq('user_id', req.userId);

    const totalViews = viewsData?.reduce((sum, item) => sum + (item.views || 0), 0) || 0;

    // Get total revenue
    const { data: revenueData, error: revenueError } = await supabase
      .from('content')
      .select('revenue')
      .eq('user_id', req.userId);

    const totalRevenue = revenueData?.reduce((sum, item) => sum + (item.revenue || 0), 0) || 0;

    // Get content by type
    const { data: typeData, error: typeError } = await supabase
      .from('content')
      .select('type, views, revenue')
      .eq('user_id', req.userId);

    const contentByType = {};
    typeData?.forEach(item => {
      if (!contentByType[item.type]) {
        contentByType[item.type] = { count: 0, views: 0, revenue: 0 };
      }
      contentByType[item.type].count++;
      contentByType[item.type].views += item.views || 0;
      contentByType[item.type].revenue += item.revenue || 0;
    });

    // Get daily performance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: dailyData, error: dailyError } = await supabase
      .from('content')
      .select('created_at, views, revenue')
      .eq('user_id', req.userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const dailyPerformance = {};
    dailyData?.forEach(item => {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      if (!dailyPerformance[date]) {
        dailyPerformance[date] = { views: 0, revenue: 0, content: 0 };
      }
      dailyPerformance[date].views += item.views || 0;
      dailyPerformance[date].revenue += item.revenue || 0;
      dailyPerformance[date].content++;
    });

    res.json({
      overview: {
        totalContent: totalContent || 0,
        totalViews,
        totalRevenue,
        averageViewsPerContent: totalContent ? Math.round(totalViews / totalContent) : 0,
        averageRevenuePerContent: totalContent ? Math.round(totalRevenue / totalContent) : 0
      },
      contentByType,
      dailyPerformance: Object.entries(dailyPerformance).map(([date, stats]) => ({
        date,
        ...stats
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get revenue analytics
router.get('/revenue', authMiddleware, async (req, res) => {
  try {
    const { data: revenueData, error } = await supabase
      .from('content')
      .select('title, views, revenue, created_at, type')
      .eq('user_id', req.userId)
      .order('revenue', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Calculate revenue metrics
    const totalRevenue = revenueData?.reduce((sum, item) => sum + (item.revenue || 0), 0) || 0;
    const topPerforming = revenueData?.slice(0, 5) || [];
    const revenueByType = {};

    revenueData?.forEach(item => {
      if (!revenueByType[item.type]) {
        revenueByType[item.type] = 0;
      }
      revenueByType[item.type] += item.revenue || 0;
    });

    res.json({
      totalRevenue,
      averageRPM: 900000, // Fixed revenue per million
      topPerforming,
      revenueByType,
      allContent: revenueData
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get platform performance
router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    const { data: contentData, error } = await supabase
      .from('content')
      .select('target_platforms, views, revenue')
      .eq('user_id', req.userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const platformPerformance = {};
    contentData?.forEach(item => {
      const platforms = item.target_platforms || [];
      platforms.forEach(platform => {
        if (!platformPerformance[platform]) {
          platformPerformance[platform] = { views: 0, revenue: 0, contentCount: 0 };
        }
        platformPerformance[platform].views += item.views || 0;
        platformPerformance[platform].revenue += item.revenue || 0;
        platformPerformance[platform].contentCount++;
      });
    });

    res.json({ platformPerformance });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance trends
router.get('/trends', authMiddleware, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    let days = 7;
    
    if (period === '30d') days = 30;
    if (period === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: trendData, error } = await supabase
      .from('content')
      .select('created_at, views, revenue')
      .eq('user_id', req.userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Group by date
    const trends = {};
    trendData?.forEach(item => {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      if (!trends[date]) {
        trends[date] = { views: 0, revenue: 0, content: 0 };
      }
      trends[date].views += item.views || 0;
      trends[date].revenue += item.revenue || 0;
      trends[date].content++;
    });

    res.json({
      period,
      trends: Object.entries(trends).map(([date, stats]) => ({
        date,
        ...stats
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
