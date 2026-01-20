// test-approve-enqueue.js
// Run with FIREBASE_ADMIN_BYPASS=1
process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || '1';

const { db, admin } = require('../src/firebaseAdmin');

async function run() {
  const contentId = `test-approve-${Date.now()}`;
  const contentRef = db.collection('content').doc(contentId);
  const contentData = {
    title: 'AutoEnqueue Test Content',
    description: 'Testing approve->enqueue flow',
    url: 'https://example.com/video.mp4',
    userId: 'test-user-123',
    target_platforms: ['facebook', 'twitter'],
    status: 'pending',
    approvalStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  await contentRef.set(contentData);
  console.log('Created content:', contentId);

  // Simulate approve route update
  await contentRef.update({
    approvalStatus: 'approved',
    approvedBy: 'admin-test',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvalNotes: 'automated test',
    status: 'approved',
  });
  console.log('Content updated to approved.');

  // Add audit log and notification (as route does)
  await db.collection('audit_logs').add({
    action: 'approve_content',
    adminId: 'admin-test',
    contentId,
    notes: 'automated test',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('notifications').add({
    userId: 'test-user-123',
    type: 'content_approved',
    contentId,
    message: 'Your content has been approved and is now live!',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Auto-enqueue using promotionTaskQueue
  const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');
  const cSnap = await contentRef.get();
  const data = cSnap.exists ? cSnap.data() : {};
  const targets = Array.isArray(data.target_platforms) ? data.target_platforms : [];
  const results = [];
  for (const platform of targets) {
    try {
      const r = await enqueuePlatformPostTask({
        contentId,
        uid: data.userId || null,
        platform,
        reason: 'approved',
        payload: {
          url: data.url,
          title: data.title,
          description: data.description,
        },
      });
      results.push({ platform, result: r });
    } catch (e) {
      results.push({ platform, error: e.message });
    }
  }

  console.log('Enqueue results:', JSON.stringify(results, null, 2));

  // List promotion_tasks created for this content
  const tasksSnap = await db.collection('promotion_tasks').where('contentId', '==', contentId).get();
  console.log('Promotion tasks count:', tasksSnap.size);
  tasksSnap.forEach(doc => {
    console.log(' -', doc.id, doc.data());
  });
}

run().catch(e => { console.error(e); process.exitCode = 1; });
