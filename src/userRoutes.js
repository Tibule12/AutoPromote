const express = require('express');
const { db } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

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