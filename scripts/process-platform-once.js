/*
Process queued platform_post promotion tasks once (dry-run friendly)
Usage: node scripts/process-platform-once.js [--iterations=5]
Set FIREBASE_ADMIN_BYPASS=1 to use test stubs.
*/
const argv = require('minimist')(process.argv.slice(2));
const iters = parseInt(argv.iterations || '5', 10);
const { processNextPlatformTask } = require('../src/services/promotionTaskQueue');

(async function main(){
  try {
    for (let i=0;i<iters;i++){
      const res = await processNextPlatformTask();
      console.log('processNextPlatformTask =>', JSON.stringify(res, null, 2));
      if (!res) { console.log('No more platform tasks ready'); break; }
    }
    process.exit(0);
  } catch (e) {
    console.error('Processing failed:', e && e.stack? e.stack : e);
    process.exit(2);
  }
})();