const express = require('express');
const { db } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Get current user (profile defaults)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const ref = db.collection('users').doc(req.userId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const data = snap.data();
    res.json({
      user: {
        id: snap.id,
        name: data.name || '',
        email: data.email || '',
        timezone: data.timezone || 'UTC',
        schedulingDefaults: data.schedulingDefaults || {
          windows: [], // e.g., [{ days:[1-5], start:'19:00', end:'21:00' }]
          frequency: 'once',
          platforms: ['youtube','tiktok','instagram']
        },
        notifications: data.notifications || { email: { uploadSuccess: true, scheduleCreated: true, weeklyDigest: false } },
        role: data.role || 'user',
        isAdmin: data.isAdmin || false
      }
    });
  } catch (err) {
    console.error('Error getting /me:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update current user (profile defaults)
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, timezone, schedulingDefaults, notifications, defaultPlatforms, defaultFrequency } = req.body;
    const ref = db.collection('users').doc(req.userId);
    const updates = {
      ...(name !== undefined ? { name } : {}),
      ...(timezone ? { timezone } : {}),
      ...(schedulingDefaults ? { schedulingDefaults } : {}),
      ...(notifications ? { notifications } : {}),
      updatedAt: new Date()
    };
    // For backward compatibility fields
    if (defaultPlatforms || defaultFrequency) {
      updates.schedulingDefaults = updates.schedulingDefaults || {};
      if (defaultPlatforms) updates.schedulingDefaults.platforms = defaultPlatforms;
      if (defaultFrequency) updates.schedulingDefaults.frequency = defaultFrequency;
    }
    await ref.set(updates, { merge: true });
    const snap = await ref.get();
    res.json({ user: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error('Error updating /me:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // Try to get user from users collection
    const userDoc = await db.collection('users').doc(req.userId).get();
    let user = null;
    if (userDoc.exists) {
      user = {
        id: userDoc.id,
        ...userDoc.data(),
        role: userDoc.data().role || 'user',
        isAdmin: userDoc.data().isAdmin || false
      };
    } else {
      // If not found, try admins collection
      const adminDoc = await db.collection('admins').doc(req.userId).get();
      if (adminDoc.exists) {
        user = {
          id: adminDoc.id,
          ...adminDoc.data(),
          role: 'admin',
          isAdmin: true
        };
      }
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    const userRef = db.collection('users').doc(req.userId);
    await userRef.update({
      name,
      email,
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await userRef.get();
    const user = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    res.json({ 
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Get content data
    const contentSnapshot = await db.collection('content')
      .where('userId', '==', req.userId)
      .get();

    const contentCount = contentSnapshot.size;
    let totalViews = 0;
    let totalRevenue = 0;

    contentSnapshot.forEach(doc => {
      const data = doc.data();
      totalViews += data.views || 0;
      totalRevenue += data.revenue || 0;
    });

    res.json({
      contentCount,
      totalViews,
      totalRevenue,
      averageViewsPerContent: contentCount ? Math.round(totalViews / contentCount) : 0
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revenue / growth progress (content count vs eligibility threshold)
router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const MIN_CONTENT_FOR_REVENUE = parseInt(process.env.MIN_CONTENT_FOR_REVENUE || '100', 10);
    // Use cached contentCount on user doc if present, else compute lightweight count query
    const userRef = db.collection('users').doc(req.userId);
    const userSnap = await userRef.get();
    let contentCount = userSnap.exists && typeof userSnap.data().contentCount === 'number' ? userSnap.data().contentCount : null;
    if (contentCount === null) {
      const cntSnap = await db.collection('content').where('user_id','==', req.userId).select().get();
      contentCount = cntSnap.size;
      // update cache (best effort)
      try { await userRef.set({ contentCount }, { merge: true }); } catch(_){}
    }
    const remaining = Math.max(0, MIN_CONTENT_FOR_REVENUE - contentCount);
    const revenueEligible = contentCount >= MIN_CONTENT_FOR_REVENUE;
    res.json({ revenueEligible, contentCount, requiredForRevenue: MIN_CONTENT_FOR_REVENUE, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get recent notifications for current user
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection('notifications')
      .where('user_id', '==', req.userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ notifications });
  } catch (err) {
    console.error('Error getting notifications:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const usersSnapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .get();

    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ users });
  } catch (error) {
    console.error('Error getting all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;