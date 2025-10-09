const express = require('express');
const { db, auth, storage } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Middleware to check admin role
const adminOnly = async (req, res, next) => {
  try {
    // Check if the user data from auth middleware has admin role
    if (req.user && (req.user.role === 'admin' || req.user.isAdmin === true)) {
      return next();
    }
    
    // Double-check with Firebase Auth custom claims as fallback
    try {
      const userRecord = await auth.getUser(req.userId);
      const customClaims = userRecord.customClaims || {};
      
      if (customClaims.admin === true) {
        console.log('User has admin claim in Firebase Auth');
        return next();
      }
    } catch (authError) {
      console.error('Error checking Firebase Auth claims:', authError);
    }
    
    // If we get here, the user is not an admin
    console.log('Access denied - not admin. User:', req.user);
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  } catch (error) {
    console.error('Error in admin middleware:', error);
    res.status(403).json({ error: 'Access denied' });
  }
};

// Approve user content
router.post('/content/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentId = req.params.id;
    const contentRef = db.collection('content').doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await contentRef.update({ 
      status: 'approved',
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await contentRef.get();
    res.json({ message: 'Content approved', content: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error('Error approving content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Decline user content
router.post('/content/:id/decline', authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentId = req.params.id;
    const contentRef = db.collection('content').doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await contentRef.update({ 
      status: 'declined',
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await contentRef.get();
    res.json({ message: 'Content declined', content: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error('Error declining content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get platform overview (admin dashboard)
router.get('/overview', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;

    const usersWithStats = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        const contentSnapshot = await db.collection('content')
          .where('userId', '==', userDoc.id)
          .get();

        const contentStats = contentSnapshot.docs.reduce((stats, doc) => {
          const content = doc.data();
          return {
            content_count: stats.content_count + 1,
            total_views: stats.total_views + (content.views || 0),
            total_revenue: stats.total_revenue + (content.revenue || 0)
          };
        }, { content_count: 0, total_views: 0, total_revenue: 0 });

        return {
          id: userDoc.id,
          ...userData,
          ...contentStats
        };
      })
    );

    res.json({ 
      total_users: totalUsers,
      users: usersWithStats 
    });
  } catch (error) {
    console.error('Error getting overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all content with user details
router.get('/content', authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentSnapshot = await db.collection('content')
      .orderBy('createdAt', 'desc')
      .get();

    const contentWithUsers = await Promise.all(
      contentSnapshot.docs.map(async (doc) => {
        const content = doc.data();
        const userDoc = await db.collection('users').doc(content.userId).get();
        const userData = userDoc.data();

        return {
          id: doc.id,
          ...content,
          user: userData ? {
            id: userDoc.id,
            name: userData.name,
            email: userData.email
          } : null
        };
      })
    );

    res.json({ content: contentWithUsers });
  } catch (error) {
    console.error('Error getting content:', error);
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

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    await userRef.update({ 
      role,
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await userRef.get();
    res.json({ 
      message: 'User role updated successfully',
      user: {
        id: updatedDoc.id,
        ...updatedDoc.data()
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's content and associated files
    const contentSnapshot = await db.collection('content')
      .where('userId', '==', userId)
      .get();

    const batch = db.batch();
    const bucket = storage.bucket();

    // Delete content documents and associated files
    for (const doc of contentSnapshot.docs) {
      const content = doc.data();
      if (content.fileUrl) {
        try {
          const fileName = content.fileUrl.split('/').pop();
          await bucket.file(fileName).delete();
        } catch (error) {
          console.warn('Error deleting file:', error);
        }
      }
      batch.delete(doc.ref);
    }

    // Delete the user document
    batch.delete(userRef);

    // Execute the batch
    await batch.commit();

    // Delete the user from Firebase Auth
    await auth.deleteUser(userId);

    res.json({ message: 'User and associated content deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
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
    const startTimestamp = startDate.toISOString();

    // Get user growth
    const usersSnapshot = await db.collection('users')
      .where('createdAt', '>=', startTimestamp)
      .orderBy('createdAt')
      .get();

    // Get content growth
    const contentSnapshot = await db.collection('content')
      .where('createdAt', '>=', startTimestamp)
      .orderBy('createdAt')
      .get();

    // Process growth data
    const userGrowthByDate = {};
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const date = new Date(userData.createdAt).toISOString().split('T')[0];
      userGrowthByDate[date] = (userGrowthByDate[date] || 0) + 1;
    });

    const contentStatsByDate = {};
    contentSnapshot.forEach(doc => {
      const content = doc.data();
      const date = new Date(content.createdAt).toISOString().split('T')[0];
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
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get variant anomalies (placeholder implementation)
router.get('/variants/anomalies', authMiddleware, adminOnly, async (req, res) => {
  try {
    // TODO: Replace with actual anomaly detection logic
    res.json({ anomalies: [], message: 'Variant anomalies endpoint is live. No anomalies detected.' });
  } catch (error) {
    console.error('Error fetching variant anomalies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
