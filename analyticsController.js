const Analytics = require('../models/Analytics');

// @desc    Create new analytics record
// @route   POST /api/analytics
// @access  Private
const createAnalytics = async (req, res) => {
  const { contentId, views, engagement, revenue } = req.body;

  try {
    const analytics = await Analytics.create({
      contentId,
      views,
      engagement,
      revenue,
    });

    res.status(201).json(analytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get analytics for a specific content
// @route   GET /api/analytics/:contentId
// @access  Public
const getAnalyticsByContentId = async (req, res) => {
  try {
    const analytics = await Analytics.findOne({ contentId: req.params.contentId });
    if (!analytics) {
      return res.status(404).json({ message: 'Analytics not found' });
    }
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAnalytics,
  getAnalyticsByContentId,
};
