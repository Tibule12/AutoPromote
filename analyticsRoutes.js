const express = require('express');
const router = express.Router();
const { createAnalytics, getAnalyticsByContentId } = require('./analyticsController');
const { protect } = require('./authMiddleware');

// Create analytics requires authentication
router.post('/', protect, createAnalytics);

// Get analytics by contentId is public
router.get('/:contentId', getAnalyticsByContentId);

module.exports = router;
