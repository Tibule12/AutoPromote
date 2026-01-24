/*
Create a content doc for the Train Video file and enqueue a YouTube upload task,
then attempt to process it once.
Usage: node scripts/create-and-publish-train-video.js --uid=bf04... --file=uploads/videos/1769084440850_Train Video.mp4
*/
const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid;
const file = argv.file || 'uploads/videos/1769084440850_Train Video.mp4';
const { db } = require('../firebaseAdmin');

if (!uid) {
  console.error('Usage: --uid required');
  process.exit(1);
}

function storageUrlFor(name) {
  return `https://firebasestorage.googleapis.com/v0/b/autopromote-cc6d3.firebasestorage.app/o/${encodeURIComponent(name)}?alt=media`;
}

(async function main(){
  try {
    const url = storageUrlFor(file);

    // Check if a content doc already references this file url
    const cSnap = await db.collection('content').where('url','==',url).limit(1).get();
    if (!cSnap.empty) {
      const doc = cSnap.docs[0];
      console.log('Content already exists:', doc.id);
      console.log(JSON.stringify(doc.data(), null, 2));
      // Still ensure it's approved
      await doc.ref.update({ status: 'approved', approvalStatus: 'approved', approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      console.log('Marked existing content as approved');
      // Enqueue upload task
      const { enqueueYouTubeUploadTask } = require('../src/services/promotionTaskQueue');
      const task = await enqueueYouTubeUploadTask({ contentId: doc.id, uid, title: doc.data().title || file, description: doc.data().description || '', fileUrl: url, shortsMode: false });
      console.log('Enqueued youtube_upload task:', task.id || task.taskId || task);
      // Try processing once
      const { processNextYouTubeTask } = require('../src/services/promotionTaskQueue');
      const res = await processNextYouTubeTask();
      console.log('processNextYouTubeTask =>', JSON.stringify(res, null, 2));
      process.exit(0);
    }

    // Create new content doc
    const contentData = {
      title: file.split('/').pop(),
      type: 'video',
      url,
      description: 'Train Video',
      target_platforms: ['youtube'],
      platform_options: { youtube: { visibility: 'public', shortsMode: false } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: uid,
      approvalStatus: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: uid,
      status: 'approved',
    };

    const ref = await db.collection('content').add(contentData);
    console.log('Created content', ref.id);

    // Enqueue YouTube upload task
    const { enqueueYouTubeUploadTask } = require('../src/services/promotionTaskQueue');
    const task = await enqueueYouTubeUploadTask({ contentId: ref.id, uid, title: contentData.title, description: contentData.description, fileUrl: url, shortsMode: false });
    console.log('Enqueued youtube_upload task:', task.id || task.taskId || task);

    // Process once immediately
    const { processNextYouTubeTask } = require('../src/services/promotionTaskQueue');
    console.log('Processing next YouTube task now...');
    const res = await processNextYouTubeTask();
    console.log('processNextYouTubeTask =>', JSON.stringify(res, null, 2));

    // Print related platform_posts if any
    try{
      const ppSnap = await db.collection('platform_posts').where('contentId','==',ref.id).get();
      if (!ppSnap.empty) {
        console.log('Related platform_posts:');
        ppSnap.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
      } else {
        console.log('No related platform_posts found');
      }
    } catch(e){ console.warn('platform_posts query failed:', e.message||e); }

    process.exit(0);
  } catch (err) {
    console.error('Script failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
