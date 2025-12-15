// collaborationEngine.js
// Real-time collaboration and squad co-creation
const crypto = require("crypto");

function randomId(len = 9) {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .substr(0, len);
}

function startCollaborationSession(userIds, contentId) {
  return {
    sessionId: randomId(9),
    userIds,
    contentId,
    startedAt: new Date(),
    status: "active",
  };
}

module.exports = {
  startCollaborationSession,
};
