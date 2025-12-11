// Compatibility wrapper for UUID generation (server-side in src)
// Follows same fallback logic as root lib/uuid-compat.js to ensure availability
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
