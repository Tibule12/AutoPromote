const supabase = require('./supabaseClient');

// @desc    Create new analytics record
// @route   POST /api/analytics
// @access  Private
const createAnalytics = async (req, res) => {
  const { contentId, views, engagement, revenue } = req.body;

  try {
    const { data: analytics, error } = await supabase
      .from('analytics')
      .insert({
        content_id: contentId,
        views,
        engagement,
        revenue,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

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
    const { data: analytics, error } = await supabase
      .from('analytics')
      .select('*')
      .eq('content_id', req.params.contentId)
      .single();

    if (error || !analytics) {
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
