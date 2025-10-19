// Small compatibility wrapper for UUID generation.
// Uses crypto.randomUUID() when available (Node 14.17+), otherwise falls back to the 'uuid' package.
try {
  const { randomUUID } = require('crypto');
  module.exports = {
    v4: () => randomUUID()
  };
} catch (e) {
  // crypto.randomUUID not available, use uuid package
  const { v4 } = require('uuid');
  module.exports = { v4 };
}
