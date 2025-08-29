const express = require('express');
const router = express.Router();
const { createContent, getAllContent } = require('./contentController');
const { protect } = require('./authMiddleware');

// Create content requires authentication
router.post('/', protect, createContent);

// Get all content is public
router.get('/', getAllContent);

module.exports = router;
