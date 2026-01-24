const { db, admin } = require('../firebaseAdmin');
(async ()=>{
  const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';
  const q = await db.collection('content').where('userId','==',uid).limit(1000).get();
  const matches = [];
  q.forEach(s=>{
    const d = s.data();
    const title = (d.title||'').toLowerCase();
    if(title.includes('tiktok login demo') || title.includes('tiktok login demo.mp4')){
      matches.push({id:s.id, title:d.title, status:d.status, url:d.url, uploadIssue:d.uploadIssue||null});
    } else if(title.includes('tiktok login')){
      matches.push({id:s.id, title:d.title, status:d.status, url:d.url, uploadIssue:d.uploadIssue||null, note:'partial match'});
    }
  });
  if(matches.length===0){
    console.log('no matches');
    process.exit(0);
  }
  console.log('matches:', JSON.stringify(matches,null,2));
  const bucket = admin.storage().bucket();
  for(const m of matches){
    if(!m.url){ console.log('no url for', m.id); continue; }
    const pm = m.url.match('/o/(.*)\\?');
    if(!pm){ console.log('cannot parse storage path from url for', m.id); continue; }
    const path = decodeURIComponent(pm[1]);
    try{
      const [meta] = await bucket.file(path).getMetadata();
      console.log('\nfile metadata for', m.id, JSON.stringify({path, contentType:meta.contentType, size:meta.size, updated:meta.updated}, null,2));
    }catch(e){
      console.error('getMetadata error for', m.id, e && e.message);
    }
  }
})().catch(e=>{ console.error(e && e.message); process.exit(1); });
