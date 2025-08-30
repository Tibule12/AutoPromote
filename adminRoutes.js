const express = require('express');
const supabase = require('./supabaseClient');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Middleware to check admin role
const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
};

// Get platform overview (admin dashboard)
router.get('/overview', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Total users
    const { count: totalUsers, error: usersError } = await supabase
      .from('users')
      .select('*', { count: 'exact' });

    // Total content
    const { count: totalContent, error: contentError } = await supabase
      .from('content')
      .select('*', { count: 'exact' });

    // Total views and revenue
    const { data: contentData, error: statsError } = await supabase
      .from('content')
      .select('views, revenue');

    const totalViews = contentData?.reduce((sum, item) => sum + (item.views || 0), 0) || 0;
    const totalRevenue = contentData?.reduce((sum, item) => sum + (item.revenue || 0), 0) || 0;

    // Recent users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: recentUsers, error: recentUsersError } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .gte('created_at', sevenDaysAgo.toISOString());

    // Recent content (last 7 days)
    const { count: recentContent, error: recentContentError } = await supabase
      .from('content')
      .select('*', { count: 'exact' })
      .gte('created_at', sevenDaysAgo.toISOString());

    res.json({
      platform_stats: {
        total_users: totalUsers || 0,
        total_content: totalContent || 0,
        total_views: totalViews,
        total_revenue: totalRevenue,
        recent_users: recentUsers || 0,
        recent_content: recentContent || 0,
        average_views_per_content: totalContent ? Math.round(totalViews / totalContent) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users with details
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get user statistics
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const { count: contentCount } = await supabase
          .from('content')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id);

        const { data: contentData } = await supabase
          .from('content')
          .select('views, revenue')
          .eq('user_id', user.id);

        const totalViews = contentData?.reduce((sum, item) => sum + (item.views || 0), 0) || 0;
        const totalRevenue = contentData?.reduce((sum, item) => sum + (item.revenue || 0), 0) || 0;

        return {
          ...user,
          content_count: contentCount || 0,
          total_views: totalViews,
          total_revenue: totalRevenue
        };
      })
    );

    res.json({ users: usersWithStats });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all content with user details
router.get('/content', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data: content, error } = await supabase
      .from('content')
      .select(`
        *,
        users (id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role
router.put('/users/:id/role', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select('id, name, email, role, created_at');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ 
      message: 'User role updated successfully',
      user: data[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;

    // First delete user's content
    const { error: contentError } = await supabase
      .from('content')
      .delete()
      .eq('user_id', userId);

    if (contentError) {
      return res.status(400).json({ error: contentError.message });
    }

    // Then delete user
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    res.json({ message: 'User and associated content deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get platform analytics
router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    let days = 7;
    
    if (period === '30d') days = 30;
    if (period === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // User growth
    const { data: userGrowth, error: userError } = await supabase
      .from('users')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Content growth
    const { data: contentGrowth, error: contentError } = await supabase
      .from('content')
      .select('created_at, views, revenue')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Process growth data
    const userGrowthByDate = {};
    userGrowth?.forEach(user => {
      const date = new Date(user.created_at).toISOString().split('T')[0];
      userGrowthByDate[date] = (userGrowthByDate[date] || 0) + 1;
    });

    const contentStatsByDate = {};
    contentGrowth?.forEach(content => {
      const date = new Date(content.created_at).toISOString().split('T')[0];
      if (!contentStatsByDate[date]) {
        contentStatsByDate[date] = { content: 0, views: 0, revenue: 0 };
      }
      contentStatsByDate[date].content++;
      contentStatsByDate[date].views += content.views || 0;
      contentStatsByDate[date].revenue += content.revenue || 0;
    });

    res.json({
      period,
      user_growth: Object.entries(userGrowthByDate).map(([date, count]) => ({ date, count })),
      content_growth: Object.entries(contentStatsByDate).map(([date, stats]) => ({ date, ...stats }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
