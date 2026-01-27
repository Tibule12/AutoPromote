#!/usr/bin/env node
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
(async ()=> {
  try {
    const filePath = process.argv[2] || 'uploads/videos/1769201141126_TikTok Login Demo.mp4';
    const dest = process.argv[3] || path.join('tmp', path.basename(filePath).replace(/\s+/g,'_'));
    await fs.promises.mkdir(path.dirname(dest), { recursive: true});
    const storage = new Storage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if(!bucketName) { console.error('FIREBASE_STORAGE_BUCKET not set'); process.exit(1); }
    const file = storage.bucket(bucketName).file(filePath);
    const [exists] = await file.exists();
    if(!exists) { console.error('file not found:', filePath); process.exit(1); }
    await file.download({destination: dest});
    const stats = await fs.promises.stat(dest);
    console.log(`Downloaded ${filePath} to ${dest}, size=${stats.size}`);
    const buf = await fs.promises.readFile(dest);
    console.log('First 256 bytes (hex):', buf.slice(0,256).toString('hex'));
    console.log('File content (utf8, first 512 chars):');
    console.log(buf.toString('utf8', 0, 512));
  } catch(e) { console.error('error', e && (e.message || e)); process.exit(1);} 
})();