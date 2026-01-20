// test-bulk-approve-enqueue.js
// Run with FIREBASE_ADMIN_BYPASS=1
process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || '1';

const { db, admin } = require('../src/firebaseAdmin');

async function run() {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const id = `test-bulk-${Date.now()}-${i}`;
    const ref = db.collection('content').doc(id);
    await ref.set({
      title: `Bulk Test ${i}`,
      description: 'Bulk approve enqueue test',
      url: `https://example.com/video${i}.mp4`,
      userId: `test-user-${i}`,
      target_platforms: i % 2 === 0 ? ['facebook', 'twitter'] : ['instagram'],
      status: 'pending',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString(),
    });
    ids.push(id);
  }
  console.log('Created content IDs:', ids);

  // Simulate bulk-approve: set approved + approvedAt
  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  for (const cid of ids) {
    const r = db.collection('content').doc(cid);
    batch.update(r, { approvalStatus: 'approved', approvedBy: 'bulk-admin', approvedAt: timestamp, status: 'approved' });
  }
  await batch.commit();
  console.log('Batch updated to approved.');

  // Run the same async enqueue logic used in route (best-effort)
  const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');
  const results = [];
  for (const cid of ids) {
    const cSnap = await db.collection('content').doc(cid).get();
    const data = cSnap.exists ? cSnap.data() : {};
    const targets = Array.isArray(data.target_platforms) ? data.target_platforms : [];
    for (const platform of targets) {
      try {
        const r = await enqueuePlatformPostTask({
          contentId: cid,
          uid: data.userId || null,
          platform,
          reason: 'approved',
          payload: { url: data.url, title: data.title, description: data.description },
        });
        results.push({ cid, platform, result: r });
      } catch (e) {
        results.push({ cid, platform, error: e.message });
      }
    }
  }

  console.log('Enqueue results:', JSON.stringify(results, null, 2));
  // List tasks
  const taskSnap = await db.collection('promotion_tasks').where('contentId', 'in', ids).get().catch(() => ({ empty: true }));
  if (!taskSnap.empty) {
    console.log('Created tasks:');
    taskSnap.forEach(d => console.log('-', d.id, d.data()));
  } else {
    console.log('No promotion_tasks found.');
  }
}

run().catch(e => { console.error(e); process.exitCode = 1; });
