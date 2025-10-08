// notificationEngine.js
// Smart notification system

function sendNotification(userId, message, type = 'info') {
  // Stub: Simulate notification
  return {
    userId,
    message,
    type,
    sentAt: new Date()
  };
}

module.exports = {
  sendNotification
};
