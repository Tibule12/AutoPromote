// Small compatibility wrapper for UUID generation.
// Uses crypto.randomUUID() when available (Node 14.17+), otherwise falls back to the 'uuid' package.
try {
  const { randomUUID } = require('crypto');
  module.exports = {
    v4: () => randomUUID()
  };
} catch (e) {
  // crypto.randomUUID not available, use uuid package
  try {
    const { v4 } = require('uuid/dist/cjs/index.js');
    module.exports = { v4 };
  } catch (fallbackError) {
    // If that fails, try the main export
    const uuid = require('uuid');
    module.exports = { v4: uuid.v4 };
  }
}
