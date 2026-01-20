// Safe simulated Facebook post script
// Usage: node scripts/test-fb-post.js <PAGE_ID>

(async function(){
  const pageId = process.argv[2];
  if(!pageId){
    console.error('Usage: node scripts/test-fb-post.js <PAGE_ID>');
    process.exit(1);
  }

  // stub global.fetch to avoid real network calls
  global.fetch = async function(url, opts){
    console.log('[stub fetch] ', url, opts && opts.method);
    return {
      ok: true,
      json: async ()=>({ id: 'simulated-post-' + Date.now() }),
      text: async ()=>'{"id":"simulated"}',
    };
  };

  try{
    const { db } = require('../src/firebaseAdmin');
    const { tokensFromDoc } = require('../src/services/connectionTokenUtils');
    const fbService = require('../src/services/facebookService');

    // Find a user with a facebook connection; if none, create a test user doc in-memory
    const usersSnap = await db.collection('users').get();
    let uid = null;
    for(const u of usersSnap.docs || []){
      const connSnap = await db.collection('users').doc(u.id).collection('connections').doc('facebook').get();
      if(connSnap.exists){ uid = u.id; break; }
    }

    let connRef;
    let doc;
    if(!uid){
      uid = 'fb-test-manual-' + Date.now();
      connRef = db.collection('users').doc(uid).collection('connections').doc('facebook');
      doc = {
        encrypted_user_access_token: null,
        pages: [],
        meta: { pages: [{ id: pageId, name: 'Staging Page', access_token: 'SIMULATED_PAGE_TOKEN' }], selectedPageId: pageId },
        tokens: { access_token: 'USER_SHORT_TOKEN_ABC123', page_access_token: 'PAGE_TOKEN_XYZ789' }
      };
      await connRef.set(doc);
    } else {
      connRef = db.collection('users').doc(uid).collection('connections').doc('facebook');
      const connSnap = await connRef.get();
      if(!connSnap.exists){ console.error('facebook doc disappeared'); process.exit(1); }
      doc = connSnap.data();
    }

    // Decrypt tokens if possible
    const tokens = tokensFromDoc(doc);
    const pageToken = (tokens && tokens.page_access_token) || (doc.meta && doc.meta.pages && doc.meta.pages[0] && doc.meta.pages[0].access_token) || null;

    // Ensure meta.pages exists and set provided page id + token
    doc.meta = doc.meta || {};
    doc.meta.pages = doc.meta.pages || [];
    if(doc.meta.pages.length === 0) doc.meta.pages.push({});
    doc.meta.pages[0].id = pageId;
    doc.meta.pages[0].access_token = pageToken || 'SIMULATED_PAGE_TOKEN';

    await connRef.set(doc, { merge: true });

    console.log('Updated in-memory facebook connection for uid', uid, 'to page', pageId);

    const payload = { pageId, message: 'Staging test post from AutoPromote (simulated)', type: 'status' };
    const res = await fbService.postToFacebook({ contentId: null, payload, reason: 'manual_test', uid });
    console.log('postToFacebook result:', res);
  }catch(e){
    console.error('Error during simulated post:', e);
    process.exit(1);
  }
})();
