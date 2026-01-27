#!/usr/bin/env node
const { getValidAccessToken } = require('../src/services/tiktokService');
const fetch = global.fetch || require('node-fetch');
(async ()=>{
  try{
    const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const size = parseInt(process.argv[3],10) || 158008374;
    const token = await getValidAccessToken(uid);
    if(!token){ console.error('no token'); process.exit(1); }
    const targetChunks = parseInt(process.argv[4],10) || 20;
    const cs = Math.ceil(size/targetChunks);
    console.log('trying chunk_size=',cs,'for targetChunks=',targetChunks);
    const body = { post_info: { title: '', privacy_level: 'SELF_ONLY' }, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: cs, total_chunk_count: Math.ceil(size/cs) } };
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await res.text();
    console.log('status', res.status, 'body', txt);
  }catch(e){ console.error('err', e && (e.message || e)); process.exit(1); }
})();