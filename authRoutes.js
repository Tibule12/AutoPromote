// Wrapper: canonical implementation moved to src/authRoutes.js
try {
  module.exports = require('./src/authRoutes');
  if (process.env.ROUTE_WRAPPER_LOG === '1') {
    console.log('[wrapper] authRoutes -> src/authRoutes.js');
  }
} catch (e) {
  console.error('[wrapper] Failed loading src/authRoutes.js:', e.message);
  throw e;
}
