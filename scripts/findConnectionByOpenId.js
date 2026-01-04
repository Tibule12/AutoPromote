const admin = require('firebase-admin');
const path = require('path');

async function main() {
  const projectId = process.argv[2] || 'autopromote-cc6d3';
  const openId = process.argv[3] || '-000X_yhj77GAF_BC32XoRzT4b6AOsGx5C2F';

  const keyPath = path.resolve(__dirname, '..', 'service-account-key.json');
  try {
    const key = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(key),
      projectId,
    });
  } catch (e) {
    console.error('Failed to load service account key:', e.message);
    process.exit(2);
  }

  const db = admin.firestore();
  try {
    console.log('Querying for open_id =', openId);
    // Quick sanity test: try a simple collection read first
    try {
      const one = await db.collection('users').limit(1).get();
      console.log('Simple users collection read OK, docs:', one.size);
    } catch (e) {
      console.error('Simple read failed:', e && e.message ? e.message : e);
    }

    // Try a raw collectionGroup limit to check if collectionGroup queries are allowed
    try {
      const cg = await db.collectionGroup('connections').limit(1).get();
      console.log('collectionGroup test OK, docs:', cg.size);
    } catch (e) {
      console.error('collectionGroup test failed:', e && e.message ? e.message : e);
    }

    // Try a collectionGroup with a different where clause
    try {
      const qw = await db.collectionGroup('connections').where('connected', '==', true).limit(1).get();
      console.log('collectionGroup where connected OK, docs:', qw.size);
    } catch (e) {
      console.error('collectionGroup where connected failed:', e && e.message ? e.message : e);
    }

    try {
      const q = await db.collectionGroup('connections').where('open_id', '==', openId).get();
      if (q.empty) {
        console.log('No matching connection documents found');
        process.exit(0);
      }
      q.forEach(doc => {
        console.log('--- Document path:', doc.ref.path);
        console.log(JSON.stringify(doc.data(), null, 2));
      });
    } catch (e) {
      console.error('collectionGroup where failed, falling back to scanning users:', e && e.message ? e.message : e);
      // Fallback: scan users and check each user's connections subcollection
      const users = await db.collection('users').get();
      for (const u of users.docs) {
        const uid = u.id;
        const connRef = db.collection('users').doc(uid).collection('connections');
        const conns = await connRef.get();
        for (const c of conns.docs) {
          const data = c.data();
          if (data && data.open_id === openId) {
            console.log('--- Found via fallback at:', c.ref.path);
            console.log(JSON.stringify(data, null, 2));
            process.exit(0);
          }
        }
      }
      console.log('No matching connection documents found via fallback');
      process.exit(0);
    }
  } catch (err) {
    console.error('Query failed:');
    console.error(err);
    if (err && err.stack) console.error(err.stack);
    process.exit(3);
  }
}

main();
