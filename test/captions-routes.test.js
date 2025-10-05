// Smoke test for captions routes import and basic service function shape
try {
  const service = require('../src/services/captionsService');
  if (!service.createCaptions || typeof service.createCaptions !== 'function') {
    console.error('captionsService.createCaptions missing');
    process.exit(1);
  }
  const router = require('../src/routes/captionsRoutes');
  if (!router) throw new Error('captionsRoutes missing');
  console.log('Captions service & routes loaded.');
} catch (e) {
  console.error('Captions test failed:', e.message);
  process.exit(1);
}
