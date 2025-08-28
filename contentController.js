const Content = require('../models/Content');

// @desc    Create new content
// @route   POST /api/content
// @access  Private
const createContent = async (req, res) => {
  const { title, type, url, userId } = req.body;

  try {
    const content = await Content.create({
      title,
      type,
      url,
      userId,
    });

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
    const content = await Content.find();
    res.json(content);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createContent,
  getAllContent,
};
