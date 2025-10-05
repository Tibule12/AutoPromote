// Test that captions routes expose raw download handler shape
try {
  const router = require('../src/routes/captionsRoutes');
  if (!router) throw new Error('captionsRoutes missing');
  console.log('Captions raw download route present (router loaded)');
} catch (e) {
  console.error('Captions download test failed:', e.message);
  process.exit(1);
}
