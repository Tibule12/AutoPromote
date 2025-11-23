#!/usr/bin/env node
const REQUIRED_KEYS = [
  'GENERIC_TOKEN_ENCRYPTION_KEY',
  'FUNCTIONS_TOKEN_ENCRYPTION_KEY',
  'TWITTER_TOKEN_ENCRYPTION_KEY'
];

const missing = REQUIRED_KEYS.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.warn('[check-encryption-env] Warning: missing encryption keys:', missing.join(', '));
  // Fail explicitly in CI to enforce keys present
  if (process.env.CI === 'true') {
    console.error('[check-encryption-env] CI mode: failing due to missing encryption keys');
    process.exit(2);
  }
} else {
  console.log('[check-encryption-env] All required encryption env vars present');
}
