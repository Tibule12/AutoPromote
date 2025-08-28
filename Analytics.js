const mongoose = require('mongoose');

const AnalyticsSchema = new mongoose.Schema({
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  engagement: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Analytics', AnalyticsSchema);
