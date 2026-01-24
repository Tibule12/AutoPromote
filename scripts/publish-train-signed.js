require('dotenv').config();
/*
Generates a signed URL for a storage file, enqueues a youtube_upload task using the signed URL,
and attempts to process it immediately.
Usage: node -r dotenv/config scripts/publish-train-signed.js --uid=<uid> --file="uploads/videos/..."
*/
const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid;
const file = argv.file;
if (!uid || !file) {
  console.error('Usage: --uid and --file required');
  process.exit(1);
}

(async function main(){
  try {
    const { admin, db } = require('../firebaseAdmin');
    const bucket = admin.storage().bucket('autopromote-cc6d3.firebasestorage.app');
    const f = bucket.file(file);
    console.log('Generating signed URL for', file);
    const [signedUrl] = await f.getSignedUrl({ action: 'read', expires: Date.now() + 60*60*1000 });
    console.log('Signed URL:', signedUrl.slice(0,120) + '...');

    const { enqueueYouTubeUploadTask } = require('../src/services/promotionTaskQueue');
    console.log('Enqueueing youtube_upload task using signed URL...');
    const task = await enqueueYouTubeUploadTask({ contentId: argv.contentId || argv.cid || argv.content || '', uid, title: argv.title || file.split('/').pop(), description: argv.description || '', fileUrl: signedUrl, shortsMode: false });
    console.log('Enqueued task:', task.id || task.taskId || JSON.stringify(task));

    // Process once
    const { processNextYouTubeTask } = require('../src/services/promotionTaskQueue');
    console.log('Processing next YouTube task now...');
    const res = await processNextYouTubeTask();
    console.log('processNextYouTubeTask =>', JSON.stringify(res, null, 2));

    // Inspect content update (if any)
    if (task && (task.id || task.taskId)) {
      const tId = task.id || task.taskId;
      // find latest youtube_upload for this content
      try {
        const snap = await db.collection('promotion_tasks').where('type','==','youtube_upload').where('uid','==',uid).orderBy('createdAt','desc').limit(5).get();
        console.log('Recent youtube_upload tasks for uid:');
        snap.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
      } catch (e) {
        console.warn('Failed to list youtube_upload tasks:', e.message || e);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('publish failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
