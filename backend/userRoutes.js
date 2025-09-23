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
