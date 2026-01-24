/*
Check recent content and promotion tasks for a given UID
Usage:
  node ./scripts/check-user-uploads.js --uid=bf04dPKELvVMivWoUyLsAVyw2sg2 --days=2
*/
const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid;
const days = parseInt(argv.days || '2', 10);
const { db } = require('../firebaseAdmin');

if (!uid) {
  console.error('Usage: --uid required');
  process.exit(1);
}

function formatTS(v){
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (v && v.seconds) return new Date(v.seconds * 1000).toISOString();
  return String(v);
}

(async function main(){
  try {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    console.log(`Querying for uid=${uid} (since ${new Date(since).toISOString()})`);

    // Content (try ordered query; fallback to un-ordered if index missing). Query both 'uid' and 'userId' fields.
    try{
      let cSnap;
      try {
        cSnap = await db.collection('content')
          .where('uid','==',uid)
          .orderBy('createdAt','desc')
          .limit(50)
          .get();
      } catch (innerErr) {
        if (innerErr && innerErr.message && innerErr.message.indexOf('requires an index') !== -1) {
          console.warn('Content orderBy index missing; retrying without orderBy (may be slower).');
          // Try both fields without ordering
          const q1 = await db.collection('content').where('uid','==',uid).limit(200).get();
          const q2 = await db.collection('content').where('userId','==',uid).limit(200).get();
          // Merge results
          const map = new Map();
          q1.forEach(d => map.set(d.id, d));
          q2.forEach(d => map.set(d.id, d));
          cSnap = { docs: Array.from(map.values()), empty: map.size === 0 };
        } else throw innerErr;
      }
      console.log('\n== Content documents ==');
      if (!cSnap || cSnap.empty) console.log('No content docs found for user');
      const rows = [];
      (cSnap.docs || []).forEach(d => {
        const data = d.data ? d.data() : d.data;
        rows.push({ id: d.id, title: data.title || '', createdAt: formatTS(data.createdAt), updatedAt: formatTS(data.updatedAt) });
      });
      rows.sort((a,b) => (a.createdAt||'') < (b.createdAt||'') ? 1 : -1);
      rows.forEach(r => console.log(r.id, '-', r.title, 'createdAt:', r.createdAt, 'updatedAt:', r.updatedAt));
    } catch (e) {
      console.error('Content query failed:', e.message || e);
    }

    // Promotion tasks (both uid and userId fields) with fallback
    try{
      let snap1, snap2;
      try {
        const q1 = db.collection('promotion_tasks').where('uid','==',uid).orderBy('createdAt','desc').limit(50).get();
        const q2 = db.collection('promotion_tasks').where('userId','==',uid).orderBy('createdAt','desc').limit(50).get();
        [snap1, snap2] = await Promise.all([q1, q2]);
      } catch (innerErr) {
        if (innerErr && innerErr.message && innerErr.message.indexOf('requires an index') !== -1) {
          console.warn('Promotion tasks orderBy index missing; retrying without orderBy (may be slower).');
          const q1u = await db.collection('promotion_tasks').where('uid','==',uid).limit(200).get();
          const q2u = await db.collection('promotion_tasks').where('userId','==',uid).limit(200).get();
          snap1 = q1u; snap2 = q2u;
        } else throw innerErr;
      }
      const seen = new Set();
      console.log('\n== Promotion tasks (uid or userId) ==');
      if ((snap1 && snap1.empty) && (snap2 && snap2.empty)) console.log('No promotion tasks found for user');
      const rows = [];
      [snap1, snap2].forEach(snap => {
        if (!snap) return;
        snap.forEach(d => {
          if (seen.has(d.id)) return; seen.add(d.id);
          const data = d.data();
          rows.push({ id: d.id, type: data.type, status: data.status, createdAt: formatTS(data.createdAt), attempts: data.attempts || 0, outcome: data.outcome ? (data.outcome.error || (data.outcome.success? 'success':'unknown')) : null });
        })
      });
      rows.sort((a,b) => (a.createdAt||'') < (b.createdAt||'') ? 1 : -1);
      rows.forEach(r => console.log(r.id, r.type, r.status, 'createdAt:', r.createdAt, 'attempts:', r.attempts, 'outcome:', r.outcome));
    } catch (e) {
      console.error('Promotion tasks query failed:', e.message || e);
    }

    // Platform posts (with fallback)
    try{
      let pSnap;
      try {
        pSnap = await db.collection('platform_posts').where('uid','==',uid).orderBy('createdAt','desc').limit(50).get();
      } catch (innerErr) {
        if (innerErr && innerErr.message && innerErr.message.indexOf('requires an index') !== -1) {
          console.warn('Platform_posts orderBy index missing; retrying without orderBy (may be slower).');
          pSnap = await db.collection('platform_posts').where('uid','==',uid).limit(200).get();
        } else throw innerErr;
      }
      console.log('\n== Platform posts ==');
      if (pSnap.empty) console.log('No platform_posts found for user');
      const pRows = [];
      pSnap.forEach(d => {
        const data = d.data();
        pRows.push({ id: d.id, platform: data.platform, success: data.success, externalId: data.externalId, createdAt: formatTS(data.createdAt) });
      });
      pRows.sort((a,b) => (a.createdAt||'') < (b.createdAt||'') ? 1 : -1);
      pRows.forEach(r => console.log(r.id, r.platform, 'success:', r.success, 'externalId:', r.externalId, 'createdAt:', r.createdAt));
    } catch (e) {
      console.error('Platform posts query failed:', e.message || e);
    }

    // Notifications (might require composite index)
    try{
      let nSnap;
      try {
        nSnap = await db.collection('notifications').where('userId','==',uid).orderBy('createdAt','desc').limit(20).get();
      } catch (innerErr) {
        if (innerErr && innerErr.message && innerErr.message.indexOf('requires an index') !== -1) {
          console.warn('Notifications index missing; retrying without orderBy (may be slower).');
          nSnap = await db.collection('notifications').where('userId','==',uid).limit(200).get();
        } else throw innerErr;
      }
      console.log('\n== Recent notifications ==');
      if (nSnap.empty) console.log('No notifications found for user');
      const nRows = [];
      nSnap.forEach(d => nRows.push({ id: d.id, createdAt: formatTS(d.data().createdAt), title: d.data().title || d.data().type || '' }));
      nRows.sort((a,b) => (a.createdAt||'') < (b.createdAt||'') ? 1 : -1);
      nRows.forEach(n => console.log(n.id, n.createdAt, n.title));
    } catch (e) {
      console.error('\nNotifications query failed (may need index):', e.message || e);
      if (e && e.message && e.message.indexOf('create it here') !== -1) {
        const match = e.message.match(/https?:\/\/[^"]+/);
        if (match) console.error('Index creation URL:', match[0]);
      }
    }

    // Also show recent content uploads (by createdAt/updatedAt recent)
    try{
      const recent = await db.collection('content').orderBy('createdAt','desc').limit(200).get();
      console.log('\n== Recent content (last 200 items) ==');
      recent.forEach(d => {
        const data = d.data();
        if (!data.uid) return;
        if (data.uid === uid || Date.parse(formatTS(data.createdAt)) >= since) {
          console.log(d.id, data.uid, formatTS(data.createdAt), data.title || '');
        }
      });
    } catch (e) {
      console.error('Recent content query failed:', e.message || e);
    }

    process.exit(0);
  } catch (err) {
    console.error('Script failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
