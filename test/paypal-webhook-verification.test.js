// Ensure paypal webhook route still loads after RSA verification addition
try {
  const router = require('../src/routes/paypalWebhookRoutes');
  if (!router) throw new Error('paypalWebhookRoutes missing');
  console.log('PayPal webhook route (with RSA support) loaded');
} catch (e) {
  console.error('PayPal webhook verification test failed:', e.message);
  process.exit(1);
}
