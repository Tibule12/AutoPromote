#!/usr/bin/env node
/*
Quarantine flagged/bad uploads by copying them to quarantine/<timestamp>/<originalPath> and deleting the original.
Dry-run by default. Use --apply to perform changes.
Usage: node -r dotenv/config scripts/quarantine-bad-uploads.js [--limit=500] [--apply]
*/
const argv = require('minimist')(process.argv.slice(2));
const apply = !!argv.apply;
const limit = parseInt(argv.limit, 10) || 500;
(async ()=>{
  try{
    const { db } = require('../src/firebaseAdmin');
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if(!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET not set');

    console.log('Quarantine script - dryRun=',!apply,' limit=',limit);

    const q = await db.collection('content').where('uploadIssue','!=', null).limit(limit).get();
    if(q.empty) { console.log('No flagged content found'); process.exit(0); }

    const ts = Date.now();
    const actions = [];

    for(const doc of q.docs){
      const d = doc.data();
      const id = doc.id;
      let storagePath = d.storagePath || null;
      let bucket = bucketName;
      // Try to infer storagePath from common URL formats
      if(!storagePath && d.url && typeof d.url === 'string'){
        try{
          const u = new URL(d.url);
          // v0/b/<bucket>/o/<path>?alt=media
          if(u.pathname && u.pathname.includes('/v0/b/')){
            const m = u.pathname.match('/v0/b/([^/]+)/o/(.+)');
            if(m){ bucket = m[1]; storagePath = decodeURIComponent(m[2]); }
          }
          // storage.googleapis.com/<bucket>/<path>
          if(!storagePath && u.hostname === 'storage.googleapis.com'){
            const parts = u.pathname.split('/').filter(Boolean);
            if(parts.length>=2){ bucket = parts[0]; storagePath = parts.slice(1).join('/'); }
          }
          // direct bucket-hosted signed url with bucket as host
          if(!storagePath && process.env.FIREBASE_STORAGE_BUCKET && u.host && u.host.includes(process.env.FIREBASE_STORAGE_BUCKET)){
            // path may be /o/<path>
            const p = u.pathname.replace(/^\//,'');
            if(p.startsWith('o/')) storagePath = decodeURIComponent(p.slice(2));
            else storagePath = decodeURIComponent(p);
          }
        }catch(e){}
      }

      if(!storagePath){
        actions.push({ id, reason: 'no_storage_path_found', doc: d });
        continue;
      }

      const src = storage.bucket(bucket).file(storagePath);
      // Destination
      const destPath = `quarantine/${ts}/${storagePath}`;
      const dest = storage.bucket(bucket).file(destPath);

      actions.push({ id, bucket, storagePath, destPath });
    }

    console.log('Found', actions.length, 'items to consider; showing sample 50');
    console.log(JSON.stringify(actions.slice(0,50), null, 2));

    if(!apply){
      console.log('\nDry-run complete. To apply changes, run with --apply');
      process.exit(0);
    }

    // Apply moves
    for(const a of actions){
      if(a.reason){
        console.warn('Skipping', a.id, a.reason);
        continue;
      }
      const { id, bucket, storagePath, destPath } = a;
      console.log('Processing', id, storagePath, '->', destPath);
      const b = storage.bucket(bucket);
      const srcF = b.file(storagePath);
      const destF = b.file(destPath);
      try{
        await srcF.copy(destF);
        console.log('Copied to', destPath);
        await srcF.delete();
        console.log('Deleted original', storagePath);
        await db.collection('content').doc(id).update({ quarantinePath: destPath, uploadIssueAction: 'quarantined', uploadIssueActionTs: new Date().toISOString() }).catch(()=>{});
      }catch(e){
        console.error('Failed processing', id, e && (e.message||e));
      }
    }

    console.log('Quarantine apply completed');
    process.exit(0);
  }catch(e){ console.error(e && (e.stack||e.message||e)); process.exit(1); }
})();