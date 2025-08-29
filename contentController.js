const supabase = require('./supabaseClient');

// @desc    Create new content
// @route   POST /api/content
// @access  Private
const createContent = async (req, res) => {
  const { title, type, url, userId } = req.body;

  try {
    const { data: content, error } = await supabase
      .from('content')
      .insert({
        title,
        type,
        url,
        user_id: userId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.status(201).json(content);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all content
// @route   GET /api/content
// @access  Public
const getAllContent = async (req, res) => {
  try {
    const { data: content, error } = await supabase
      .from('content')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.json(content);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createContent,
  getAllContent,
};
