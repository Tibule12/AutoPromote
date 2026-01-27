// Fetches TikTok video list for a user's connection and returns analytics for the first matching video (by title containing 'TikTok Login' or the first video)
(async ()=>{
  try{
    const { db } = require('../src/firebaseAdmin');
    const fetch = global.fetch || require('node-fetch');
    const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    console.log('Using uid=', uid);

    const { getValidAccessToken, getUserTikTokConnection } = require('../src/services/tiktokService');
    let access = await getValidAccessToken(uid);
    if(!access) throw new Error('No access token available for uid');
    const conn = await getUserTikTokConnection(uid);
    const openId = (conn && (conn.open_id || (conn.meta && conn.meta.open_id))) || null;
    console.log('openId:', openId);

    const listUrl = 'https://open.tiktokapis.com/v2/video/list/?fields=id,title,share_url,create_time';
    let listRes = await fetch(listUrl, { method:'POST', headers: { Authorization: 'Bearer '+access, 'Content-Type':'application/json' }, body: JSON.stringify({ max_count: 50 }) });
    let listTxt = await listRes.text().catch(()=>'<no-body>');
    console.log('list status', listRes.status);
    if(listRes.status === 401) {
      console.log('List returned 401; attempting server-side refresh using stored refresh token (if present)');
      const conn = await require('../src/services/tiktokService').getUserTikTokConnection(uid);
      const refreshTok = conn && conn.tokens && (conn.tokens.refresh_token || conn.tokens.refreshToken || conn.tokens.refresh);
      if(refreshTok) {
        console.log('Found refresh token; attempting refresh');
        try{
          const refreshed = await require('../src/services/tiktokService').refreshToken(uid, refreshTok);
          console.log('Refresh result keys:', Object.keys(refreshed || {}));
          access = refreshed && refreshed.access_token ? refreshed.access_token : access;
          console.log('New access token (masked):', access && (access.slice(0,8) + '...' + access.slice(-8)));
          listRes = await fetch(listUrl, { method:'POST', headers: { Authorization: 'Bearer '+access, 'Content-Type':'application/json' }, body: JSON.stringify({ max_count: 50 }) });
          listTxt = await listRes.text().catch(()=>'<no-body>');
          console.log('list retry status', listRes.status);
        }catch(e){ console.error('refresh failed', e && e.message); }
      } else {
        console.log('no refresh token available');
      }
    }

    const listJson = JSON.parse(listTxt || '{}');
    const videos = listJson.data && listJson.data.videos ? listJson.data.videos : [];
    console.log('videos returned:', videos.length);

    let target = videos.find(v => (v.title||'').includes('TikTok Login')) || videos[0];
    if(!target) throw new Error('No video available to fetch analytics');
    console.log('selected video', { id: target.id, title: target.title, share_url: target.share_url });

    const videoId = target.id;
    const analyticsUrl = `https://open.tiktokapis.com/v2/video/data/?open_id=${encodeURIComponent(openId)}&video_id=${encodeURIComponent(videoId)}`;
    const aRes = await fetch(analyticsUrl, { method:'GET', headers: { Authorization: 'Bearer '+access } });
    const aTxt = await aRes.text().catch(()=>'<no-body>');
    console.log('analytics status', aRes.status);
    console.log('analytics body (full):', aTxt);
  }catch(e){ console.error('Failed:', e && (e.stack || e.message || e)); process.exit(1); }
})();