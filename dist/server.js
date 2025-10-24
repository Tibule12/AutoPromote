
// Compatibility wrapper: the backend has moved to src/server.js.
// Keeping this file so existing process managers or deployment scripts that run `node server.js`
// continue to function without modification.
try {
  module.exports = require('./src/server');
  if (process.env.SERVER_WRAPPER_LOG !== '0') {
    console.log('[wrapper] Delegated to src/server.js');
  }
} catch (e) {
  console.error('[wrapper] Failed to load src/server.js:', e.message);
  throw e;
}
const userRoutes = require('./userRoutes');

const contentRoutes = require('./contentRoutes');

