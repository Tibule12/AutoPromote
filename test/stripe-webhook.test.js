// Stripe webhook route smoke test
try {
  const router = require('../src/routes/stripeWebhookRoutes');
  if (!router) throw new Error('stripeWebhookRoutes missing');
  console.log('Stripe webhook routes loaded');
} catch (e) {
  console.error('Stripe webhook route load failed:', e.message);
  process.exit(1);
}
