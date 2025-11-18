// Compatibility wrapper for UUID generation used inside `autopromote-functions`.
// Prefer `crypto.randomUUID()` (Node 14.17+) and fall back to the public `uuid` package.
// This file is intentionally a copy of the root project `lib/uuid-compat.js` so that
// Cloud Functions can be deployed independently without requiring files outside
// the `autopromote-functions` folder.
try {
  const { randomUUID } = require('crypto');
  if (typeof randomUUID === 'function') {
    module.exports = { v4: () => randomUUID() };
  } else {
    throw new Error('randomUUID not available');
  }
} catch (_err) {
  try {
    const { v4 } = require('uuid');
    module.exports = { v4 };
  } catch (err2) {
    const uuid = require('uuid');
    module.exports = { v4: uuid && (uuid.v4 || uuid.default && uuid.default.v4) };
  }
}
