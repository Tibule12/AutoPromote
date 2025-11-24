// Simple validator to attempt requiring the functions index and log exported symbols.
// This helps detect import-time throws in Cloud Functions entry points.

try {
  const idx = require('./index.js');
  if (!idx || typeof idx !== 'object') {
    console.error('Index did not export an object, got:', typeof idx);
    process.exit(2);
  }
  console.log('✅ Successfully required autopromote-functions/index.js');
  const keys = Object.keys(idx).sort();
  console.log('Exported symbols (count=' + keys.length + '):');
  keys.forEach(k => console.log(' -', k));
  // Check api export specifically
  if ('api' in idx) {
    console.log('✅ api export is present');
  } else {
    console.warn('⚠️ api export is NOT present');
  }
  process.exit(0);
} catch (e) {
  console.error('❌ Error requiring index.js:', e && e.stack ? e.stack : e);
  process.exit(1);
}
