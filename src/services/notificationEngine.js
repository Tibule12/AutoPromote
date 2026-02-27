// notificationEngine.js
// Smart notification system
const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");

/**
 * Send a notification to a userId (Persisted in Firestore)
 * @param {string} userId - The target user
 * @param {string} message - The message text
 * @param {string} type - 'info', 'success', 'warning', 'error'
 * @param {object} metadata - Extra details (e.g., contentId)
 */
async function sendNotification(userId, message, type = "info", metadata = {}) {
  try {
    if (!userId) {
      logger.warn("[Notification] No userId provided for notification");
      return;
    }

    const notification = {
      user_id: userId,
      message: message,
      type: type,
      metadata: metadata,
      read: false,
      created_at: new Date().toISOString(),
    };

    // Persist to Firestore so frontend can display it
    // The frontend listens to: db.collection("notifications").where("user_id", "==", uid)
    await db.collection("notifications").add(notification);

    logger.debug(`[Notification] Sent to ${userId}: ${message}`);
    return notification;
  } catch (error) {
    logger.error("[Notification] Failed to send:", error);
    return null;
  }
}

module.exports = {
  sendNotification,
};
