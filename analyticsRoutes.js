const express = require('express');
const router = express.Router();
const { createAnalytics, getAnalyticsByContentId } = require('../controllers/analyticsController');

router.post('/', createAnalytics);
router.get('/:contentId', getAnalyticsByContentId);

module.exports = router;
