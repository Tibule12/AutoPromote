// Wrapper: canonical userRoutes moved to src/userRoutes.js
try {
  module.exports = require('./src/userRoutes');
  if (process.env.ROUTE_WRAPPER_LOG === '1') console.log('[wrapper] userRoutes -> src/userRoutes.js');
} catch (e) {
  console.error('[wrapper] Failed loading src/userRoutes.js:', e.message);
  throw e;
}