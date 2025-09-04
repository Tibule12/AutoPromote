const { db, storage } = require('./firebaseAdmin');

// @desc    Create new content
// @route   POST /api/content
// @access  Private
const createContent = async (req, res) => {
  const { title, type, url, description } = req.body;
  const userId = req.userId; // From auth middleware

  try {
    // Validate required fields
    if (!title || !type || !url) {
      return res.status(400).json({ message: 'Title, type, and URL are required' });
    }

    const docRef = await db.collection('content').add({
      title,
      type,
      url,
      description: description || '',
      user_id: userId, // Standardized field name
      views: 0,
      clicks: 0,
      revenue: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const doc = await docRef.get();
    console.log('Content created successfully:', doc.id);
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Error creating content:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all content
// @route   GET /api/content
// @access  Public
const getAllContent = async (req, res) => {
  try {
    const snapshot = await db.collection('content')
      .orderBy('created_at', 'desc')
      .get();
    
    const content = [];
    snapshot.forEach(doc => {
      content.push({ id: doc.id, ...doc.data() });
    });
    res.json(content);
  } catch (error) {
    console.error('Error getting all content:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get content by ID
// @route   GET /api/content/:id
// @access  Public
const getContentById = async (req, res) => {
  try {
    const doc = await db.collection('content').doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Increment views
    await doc.ref.update({
      views: (doc.data().views || 0) + 1
    });

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user's content
// @route   GET /api/content/my-content
// @access  Private
const getUserContent = async (req, res) => {
  try {
    const snapshot = await db.collection('content')
      .where('user_id', '==', req.userId)
      .orderBy('created_at', 'desc')
      .get();
    
    const content = [];
    snapshot.forEach(doc => {
      content.push({ id: doc.id, ...doc.data() });
    });
    res.json(content);
  } catch (error) {
    console.error('Error getting user content:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update content
// @route   PUT /api/content/:id
// @access  Private
const updateContent = async (req, res) => {
  try {
    const docRef = db.collection('content').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check ownership
    if (doc.data().user_id !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    await docRef.update(updateData);
    
    const updated = await docRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete content
// @route   DELETE /api/content/:id
// @access  Private
const deleteContent = async (req, res) => {
  try {
    const docRef = db.collection('content').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check ownership
    if (doc.data().userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await docRef.delete();
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createContent,
  getAllContent,
  getContentById,
  getUserContent,
  updateContent,
  deleteContent
};
