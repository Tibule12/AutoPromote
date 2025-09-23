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
