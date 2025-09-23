const express = require('express');
const { db } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// Get content analytics
router.get('/content/:id', authMiddleware, async (req, res) => {
  try {
    const contentId = req.params.id;
    
    const contentRef = db.collection('content').doc(contentId);
    const contentDoc = await contentRef.get();
    
    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = contentDoc.data();
    
    // Check if user has permission to view this content's analytics
    if (content.userId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get analytics data
    const analyticsRef = db.collection('analytics').doc(contentId);
    const analyticsDoc = await analyticsRef.get();
    const analytics = analyticsDoc.exists ? analyticsDoc.data() : {
      views: 0,
      likes: 0,
      shares: 0,
      revenue: 0
    };

    res.json({ analytics });
  } catch (error) {
    console.error('Error getting content analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
