const express = require('express');
const supabase = require('./supabaseClient');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('id', req.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    const { data, error } = await supabase
      .from('users')
      .update({ name, email })
      .eq('id', req.userId)
      .select('id, name, email, role, created_at');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ 
      message: 'Profile updated successfully',
      user: data[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Get content count
    const { count: contentCount, error: contentError } = await supabase
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

    res.json({
      contentCount: contentCount || 0,
      totalViews,
      totalRevenue,
      averageViewsPerContent: contentCount ? Math.round(totalViews / contentCount) : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
