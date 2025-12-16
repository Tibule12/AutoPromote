const { db } = require("./firebaseClient");

// @desc    Create new analytics record
// @route   POST /api/analytics
// @access  Private
const createAnalytics = async (req, res) => {
  const { contentId, views, engagement, revenue } = req.body;
  try {
    const docRef = await db.collection("analytics").add({
      content_id: contentId,
      views,
      engagement,
      revenue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const doc = await docRef.get();
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get analytics for a specific content
// @route   GET /api/analytics/:contentId
// @access  Public
const getAnalyticsByContentId = async (req, res) => {
  try {
    const snapshot = await db
      .collection("analytics")
      .where("content_id", "==", req.params.contentId)
      .get();
    if (snapshot.empty) {
      return res.status(404).json({ message: "Analytics not found" });
    }
    // Return the first matching analytics document
    const doc = snapshot.docs[0];
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAnalytics,
  getAnalyticsByContentId,
};
