#!/usr/bin/env node
// Simulate enqueueing a platform post task using the fast-path test stub (sets FIREBASE_ADMIN_BYPASS=1)
const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid || argv.u || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
const platform = (argv.platform || argv.p || 'twitter').toLowerCase();
const message = argv.message || argv.m || `Test ${platform} post at ${new Date().toISOString()}`;
const contentId = argv.contentId || argv.c || null;
(async ()=>{
  try{
    // Ensure test fast-path env flag
    process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || '1';
    const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');
    const payload = { message };
    const res = await enqueuePlatformPostTask({ contentId, uid, platform, reason: 'simulated_test', payload, skipIfDuplicate: false, forceRepost: true });
    console.log('Enqueue result:', JSON.stringify(res, null, 2));
    process.exit(0);
  }catch(e){
    console.error('Failed to enqueue:', e && (e.stack || e.message || e));
    process.exit(2);
  }
})();