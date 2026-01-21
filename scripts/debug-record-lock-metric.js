(async () => {
  try {
    const path = require('path');
    const root = path.resolve(__dirname, '..');
    const { recordLockTakeoverAttempt, getCounters } = require(path.join(root, 'src', 'services', 'aggregationService'));
    console.log('Invoking recordLockTakeoverAttempt...');
    await recordLockTakeoverAttempt('twitter');
    console.log('Waiting 200ms...');
    await new Promise(r => setTimeout(r, 200));
    const counters = await getCounters();
    console.log('Counters:', counters);
  } catch (e) { console.error('ERR', e); }
})();