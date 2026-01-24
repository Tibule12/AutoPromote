const { db } = require('../firebaseAdmin');
const { Storage } = require('@google-cloud/storage');
(async ()=>{
  // Try env first
  const envBucket = process.env.FIREBASE_STORAGE_BUCKET;
  // Try to find a sample content doc to extract bucket if env missing
  let bucketName = envBucket || null;
  if(!bucketName){
    const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const q = await db.collection('content').where('userId','==',uid).limit(10).get();
    for(const doc of q.docs){
      const d = doc.data();
      if(d && d.url){
        const m = d.url.match('/v0/b/([^/]+)/o/');
        if(m){ bucketName = m[1]; break; }
      }
    }
  }
  if(!bucketName){ console.error('No bucket name found (set FIREBASE_STORAGE_BUCKET or ensure content.url present)'); process.exit(1); }
  console.log('Using bucket:', bucketName);
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const prefix = 'uploads/videos/';
  const [files] = await bucket.getFiles({ prefix });
  if(!files || files.length===0){ console.log('No files under', prefix); process.exit(0); }
  console.log('Found', files.length, 'files:');
  for(const f of files){
    console.log('-', f.name, 'size:', f.metadata && f.metadata.size ? f.metadata.size : 'unknown', 'contentType:', f.metadata && f.metadata.contentType ? f.metadata.contentType : 'unknown');
  }
})().catch(e=>{ console.error('error', e && e.message); process.exit(1); });
