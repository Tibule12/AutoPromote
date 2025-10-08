// sentimentModerationEngine.js
// Sentiment analysis and comment moderation

function analyzeSentiment(comments) {
  // Stub: Simulate sentiment analysis
  const positive = comments.filter(c => c.includes('love') || c.includes('great')).length;
  const negative = comments.filter(c => c.includes('hate') || c.includes('bad')).length;
  return {
    total: comments.length,
    positive,
    negative,
    sentimentScore: ((positive - negative) / comments.length).toFixed(2)
  };
}

function moderateComments(comments) {
  // Stub: Remove negative comments
  return comments.filter(c => !c.includes('hate') && !c.includes('bad'));
}

module.exports = {
  analyzeSentiment,
  moderateComments
};
