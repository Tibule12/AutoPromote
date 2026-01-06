#!/usr/bin/env node
// Inspect connections for a given user and print sanitized summary (no tokens)
const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid || argv.u || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
const { admin, db } = require('../src/firebaseAdmin');
(async function(){
  try {
    const conns = await db.collection('users').doc(uid).collection('connections').get();
    if (conns.empty) return console.log('No connections for user', uid);
    const out = [];
    conns.forEach(d => {
      const data = d.data() || {};
      const summary = {
        path: d.ref.path,
        id: d.id,
        provider: data.provider || d.id,
        display_name: data.display_name || (data.meta && data.meta.display_name) || null,
        open_id: data.open_id || null,
        scope: data.scope || null,
        hasEncryption: !!data.hasEncryption || !!data.encrypted_access_token || !!data.encrypted_refresh_token || false,
        tokensPresent: !!data.tokens || !!data.encrypted_access_token || !!data.encrypted_refresh_token || false,
        tokenFields: data.tokens && typeof data.tokens === 'object' ? Object.keys(data.tokens) : (data.tokens ? ['tokens_present'] : []),
        obtainedAt: data.obtainedAt || data.updatedAt || null,
        has_creator_info: !!data.creator_info,
      };
      out.push(summary);
    });
    console.log('Connections for', uid, ':');
    for (const s of out) console.log(JSON.stringify(s, null, 2));
  } catch (e) {
    console.error('Failed to inspect connections:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();