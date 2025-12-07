const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');
const { db, admin } = require('../firebaseAdmin');

// Get all feature flags
router.get('/flags', authMiddleware, adminOnly, async (req, res) => {
  try {
    const snapshot = await db.collection('feature_flags').get();
    
    const flags = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ success: true, flags });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create or update feature flag
router.post('/flags', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, enabled, description, rolloutPercentage, targetUsers } = req.body;
    
    const flagData = {
      name,
      enabled: enabled !== undefined ? enabled : false,
      description: description || '',
      rolloutPercentage: rolloutPercentage || 100,
      targetUsers: targetUsers || [],
      updatedBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const flagRef = await db.collection('feature_flags').add(flagData);
    
    // Log action
    await db.collection('audit_logs').add({
      action: 'create_feature_flag',
      adminId: req.user.uid,
      flagId: flagRef.id,
      flagName: name,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, flagId: flagRef.id });
  } catch (error) {
    console.error('Error creating feature flag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle feature flag
router.patch('/flags/:flagId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { flagId } = req.params;
    const { enabled, rolloutPercentage } = req.body;
    
    const updateData = {
      updatedBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (enabled !== undefined) updateData.enabled = enabled;
    if (rolloutPercentage !== undefined) updateData.rolloutPercentage = rolloutPercentage;
    
    await db.collection('feature_flags').doc(flagId).update(updateData);
    
    // Log action
    await db.collection('audit_logs').add({
      action: 'update_feature_flag',
      adminId: req.user.uid,
      flagId,
      changes: updateData,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, message: 'Feature flag updated' });
  } catch (error) {
    console.error('Error updating feature flag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cohort analysis
router.get('/cohorts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { metric = 'retention', period = 'week' } = req.query;
    
    const usersSnapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();
    
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Group users by cohort (signup period)
    const cohorts = {};
    
    users.forEach(user => {
      const createdAt = user.createdAt?.toDate?.() || new Date(user.createdAt);
      let cohortKey;
      
      if (period === 'week') {
        const weekStart = new Date(createdAt);
        weekStart.setDate(createdAt.getDate() - createdAt.getDay());
        cohortKey = weekStart.toISOString().split('T')[0];
      } else if (period === 'month') {
        cohortKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
      } else {
        cohortKey = createdAt.toISOString().split('T')[0];
      }
      
      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          cohortKey,
          users: [],
          size: 0,
          active: 0,
          converted: 0,
          revenue: 0
        };
      }
      
      cohorts[cohortKey].users.push(user.id);
      cohorts[cohortKey].size++;
      
      if (user.lastActive) {
        const daysSinceActive = (Date.now() - (user.lastActive.toDate?.() || new Date(user.lastActive))) / (1000 * 60 * 60 * 24);
        if (daysSinceActive < 7) cohorts[cohortKey].active++;
      }
      
      if (user.plan && user.plan !== 'free') cohorts[cohortKey].converted++;
    });
    
    const cohortArray = Object.values(cohorts)
      .sort((a, b) => b.cohortKey.localeCompare(a.cohortKey))
      .slice(0, 12);
    
    res.json({ success: true, cohorts: cohortArray, metric, period });
  } catch (error) {
    console.error('Error fetching cohorts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get conversion funnel
router.get('/funnel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    let startDate = new Date();
    if (timeframe === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '90d') {
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    }
    
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
    
    // Get users who signed up in timeframe
    const signupsSnapshot = await db.collection('users')
      .where('createdAt', '>=', startTimestamp)
      .get();
    
    const userIds = signupsSnapshot.docs.map(doc => doc.id);
    const totalSignups = userIds.length;
    
    // Get users who uploaded content
    const uploadedSnapshot = await db.collection('content')
      .where('createdAt', '>=', startTimestamp)
      .get();
    
    const uploadedUsers = new Set(uploadedSnapshot.docs.map(doc => doc.data().userId));
    const totalUploaded = uploadedUsers.size;
    
    // Get users who promoted content
    const promotedSnapshot = await db.collection('promotion_tasks')
      .where('createdAt', '>=', startTimestamp)
      .where('status', 'in', ['completed', 'success'])
      .get();
    
    const promotedUsers = new Set(promotedSnapshot.docs.map(doc => doc.data().uid));
    const totalPromoted = promotedUsers.size;
    
    // Get users who converted to paid
    const convertedSnapshot = await db.collection('users')
      .where('createdAt', '>=', startTimestamp)
      .where('plan', 'in', ['premium', 'pro'])
      .get();
    
    const totalConverted = convertedSnapshot.size;
    
    const funnel = [
      { stage: 'Signup', count: totalSignups, percentage: 100 },
      { 
        stage: 'Upload Content', 
        count: totalUploaded, 
        percentage: totalSignups > 0 ? (totalUploaded / totalSignups) * 100 : 0 
      },
      { 
        stage: 'Promote Content', 
        count: totalPromoted, 
        percentage: totalSignups > 0 ? (totalPromoted / totalSignups) * 100 : 0 
      },
      { 
        stage: 'Convert to Paid', 
        count: totalConverted, 
        percentage: totalSignups > 0 ? (totalConverted / totalSignups) * 100 : 0 
      }
    ];
    
    res.json({ success: true, funnel, timeframe });
  } catch (error) {
    console.error('Error fetching conversion funnel:', error.message || error);
    if (error && error.message && error.message.includes('requires an index')) {
      const linkMatch = (error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/) || [null])[0];
      return res.status(422).json({ success: false, error: 'Missing Firestore composite index required by this query', indexLink: linkMatch || null });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get A/B test results (variant performance)
router.get('/ab-tests', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const snapshot = await db.collection('variant_stats')
      .orderBy('updatedAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const tests = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      if (data.platforms) {
        Object.entries(data.platforms).forEach(([platform, platformData]) => {
          if (platformData.variants && Array.isArray(platformData.variants)) {
            platformData.variants.forEach(variant => {
              tests.push({
                contentId: doc.id,
                platform,
                variant: variant.value,
                posts: variant.posts || 0,
                clicks: variant.clicks || 0,
                ctr: variant.posts > 0 ? (variant.clicks / variant.posts) * 100 : 0,
                decayedCtr: variant.decayedPosts > 0 ? (variant.decayedClicks / variant.decayedPosts) * 100 : 0,
                suppressed: variant.suppressed || false,
                quarantined: variant.quarantined || false,
                anomaly: variant.anomaly || false,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
              });
            });
          }
        });
      }
    });
    
    // Sort by performance
    tests.sort((a, b) => b.ctr - a.ctr);
    
    // Calculate statistics
    const activeTests = tests.filter(t => !t.suppressed && !t.quarantined);
    const avgCtr = activeTests.reduce((sum, t) => sum + t.ctr, 0) / activeTests.length || 0;
    const topPerformers = tests.filter(t => t.ctr > avgCtr * 1.5).slice(0, 10);
    const poorPerformers = tests.filter(t => t.ctr < avgCtr * 0.5 && t.posts > 10).slice(0, 10);
    
    res.json({
      success: true,
      tests: tests.slice(0, 50),
      stats: {
        totalVariants: tests.length,
        activeVariants: activeTests.length,
        avgCtr: avgCtr.toFixed(2),
        topPerformers,
        poorPerformers
      }
    });
  } catch (error) {
    console.error('Error fetching A/B tests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user segments
router.get('/segments', authMiddleware, adminOnly, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Segment by plan
    const byPlan = {
      free: users.filter(u => !u.plan || u.plan === 'free').length,
      premium: users.filter(u => u.plan === 'premium').length,
      pro: users.filter(u => u.plan === 'pro').length
    };
    
    // Segment by activity
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    const byActivity = {
      active: users.filter(u => {
        const lastActive = u.lastActive?.toDate?.() || new Date(u.lastActive || 0);
        return lastActive.getTime() > weekAgo;
      }).length,
      inactive: users.filter(u => {
        const lastActive = u.lastActive?.toDate?.() || new Date(u.lastActive || 0);
        return lastActive.getTime() < monthAgo;
      }).length
    };
    
    // Segment by content creation
    const contentSnapshot = await db.collection('content').get();
    const userContentCounts = {};
    contentSnapshot.docs.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) {
        userContentCounts[userId] = (userContentCounts[userId] || 0) + 1;
      }
    });
    
    const byContentCreation = {
      powerCreators: Object.values(userContentCounts).filter(count => count >= 10).length,
      regularCreators: Object.values(userContentCounts).filter(count => count >= 3 && count < 10).length,
      newCreators: Object.values(userContentCounts).filter(count => count < 3).length
    };
    
    res.json({
      success: true,
      segments: {
        byPlan,
        byActivity,
        byContentCreation,
        totalUsers: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching user segments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get conversion funnel data
router.get('/funnel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const days = parseInt(timeframe.replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Mock funnel data (replace with actual analytics)
    const funnelData = {
      timeframe,
      stages: [
        { stage: 'Visit', users: 1000, percentage: 100 },
        { stage: 'Sign Up', users: 250, percentage: 25 },
        { stage: 'Upload Content', users: 150, percentage: 15 },
        { stage: 'Connect Platform', users: 100, percentage: 10 },
        { stage: 'Publish', users: 75, percentage: 7.5 },
        { stage: 'Subscribe', users: 25, percentage: 2.5 }
      ],
      conversionRate: 2.5,
      dropOffPoints: [
        { from: 'Visit', to: 'Sign Up', dropOff: 75 },
        { from: 'Sign Up', to: 'Upload Content', dropOff: 40 },
        { from: 'Upload Content', to: 'Connect Platform', dropOff: 33 }
      ]
    };
    
    res.json({ success: true, funnel: funnelData });
  } catch (error) {
    console.error('Error fetching funnel data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get content approval pending items
router.get('/approval/pending', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Query for pending content (if collection exists)
    let pendingContent = [];
    try {
      const snapshot = await db.collection('content')
        .where('approvalStatus', '==', 'pending')
        .limit(50)
        .get();
      
      pendingContent = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (queryError) {
      console.log('No pending content or collection missing:', queryError.message);
    }
    
    res.json({ success: true, content: pendingContent, count: pendingContent.length });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get approval stats
router.get('/approval/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Mock stats (replace with actual data)
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      avgApprovalTime: 0,
      todayApproved: 0,
      todayRejected: 0
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
