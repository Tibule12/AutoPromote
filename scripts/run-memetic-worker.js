#!/usr/bin/env node
const { runOnce } = require('../src/services/memeticWorker');

(async () => {
  try {
    console.log('Running memetic worker (once)...');
    const res = await runOnce({ limit: 20 });
    console.log('Results:', res);
    process.exit(0);
  } catch (err) {
    console.error('Worker failed:', err);
    process.exit(1);
  }
})();
