const express = require('express');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const authMiddleware = require('../authMiddleware');

// Revenue analytics endpoint
router.get('/revenue-analytics', authMiddleware, async (req, res) => {
  try {
    // Only allow admins
    if (!req.user || !(req.user.role === 'admin' || req.user.isAdmin === true)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch all content documents
    const contentSnapshot = await db.collection('content').get();
    const content = [];
    contentSnapshot.forEach(doc => content.push(doc.data()));

    // Calculate revenue analytics
    const totalRevenue = content.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const revenueToday = content.filter(item => {
      if (!item.created_at) return false;
      const created = new Date(item.created_at._seconds ? item.created_at._seconds * 1000 : item.created_at);
      return created >= today;
    }).reduce((sum, item) => sum + (item.revenue || 0), 0);
    const avgRevenuePerContent = content.length > 0 ? totalRevenue / content.length : 0;
    // For demo: avg revenue per user is 0 (unless you want to fetch users)
    const avgRevenuePerUser = 0;
    const projectedMonthlyRevenue = totalRevenue * 1.2;
    // Simple daily breakdown for the last 7 days
    const dailyBreakdown = Array.from({ length: 7 }).map((_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayRevenue = content.filter(item => {
        if (!item.created_at) return false;
        const created = new Date(item.created_at._seconds ? item.created_at._seconds * 1000 : item.created_at);
        return created >= day && created < new Date(day.getTime() + 24 * 60 * 60 * 1000);
      }).reduce((sum, item) => sum + (item.revenue || 0), 0);
      return { date: day.toISOString().split('T')[0], revenue: dayRevenue };
    }).reverse();

    res.json({
      totalRevenue,
      revenueToday,
      avgRevenuePerContent,
      avgRevenuePerUser,
      projectedMonthlyRevenue,
      dailyBreakdown
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

module.exports = router;
