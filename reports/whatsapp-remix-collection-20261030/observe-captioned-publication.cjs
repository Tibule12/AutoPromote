// Read-only verification of the acknowledged publication and exact uploaded media.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../../../AutoPromote/.env'),quiet:true});
assert(!process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_ADMIN_BYPASS !== '1' && process.env.CI_ROUTE_IMPORTS !== '1');
const {db,storage} = require('../../firebaseAdmin');
const directory = path.join(__dirname,'private/selected-three-captioned-five-lines/slowed_reverb');
async function main() {
  const publication = JSON.parse(fs.readFileSync(path.join(directory,'publication.json')));
  const recording = JSON.parse(fs.readFileSync(path.join(directory,'studio-recording-delivery.json')));
  assert(publication.contentId && publication.mediaSha256 === recording.sha256);
  const [contentSnapshot,tasksSnapshot] = await Promise.all([
    db.collection('content').doc(publication.contentId).get(),
    db.collection('promotion_tasks').where('contentId','==',publication.contentId).get(),
  ]);
  assert(contentSnapshot.exists);
  const content = contentSnapshot.data();
  assert.equal(content.title,publication.title);
  assert(content.storagePath);
  const [uploaded] = await storage.bucket().file(content.storagePath).download();
  assert.equal(crypto.createHash('sha256').update(uploaded).digest('hex'),recording.sha256);
  const tasks = tasksSnapshot.docs.map(doc => {
    const task = doc.data(), outcome = task.outcome || task.platformOutcome || task.result || {};
    const tiktokFile = path.join(directory,'tiktok-provider-status.json');
    const tiktok = task.platform === 'tiktok' && fs.existsSync(tiktokFile)
      ? JSON.parse(fs.readFileSync(tiktokFile)) : null;
    if (tiktok) assert.equal(tiktok.contentId,publication.contentId);
    const providerStatus = tiktok?.status || outcome.status || null;
    const success = outcome.success === true && !outcome.simulated;
    const postId = outcome.postId || outcome.platformPostId || outcome.videoId || outcome.mediaId || outcome.shareId || outcome.id || task.videoId || null;
    return {
      taskId:doc.id,platform:task.platform,status:task.status,
      success,providerStatus,
      published:success && (task.platform !== 'tiktok' || providerStatus === 'PUBLISH_COMPLETE'),
      postId,publishId:outcome.publishId || null,
      url:outcome.postUrl || outcome.platformUrl || outcome.url || (task.platform === 'youtube' && postId ? 'https://www.youtube.com/watch?v='+postId : null),
      error:outcome.error || task.lastError || task.error || null,
    };
  });
  assert.equal(tasks.length,5,'Require exactly the five requested provider tasks');
  assert.deepEqual(tasks.map(task=>task.platform).sort(),publication.destinations.slice().sort());
  const result = {
    observedAt:new Date().toISOString(),contentId:publication.contentId,
    title:publication.title,deliveryMode:publication.deliveryMode,
    exactUploadedStudioRecordingSha256:recording.sha256,uploadedBytes:uploaded.length,
    tasks,confirmedPlatforms:tasks.filter(task=>task.published).map(task=>task.platform),
    allProvidersAccepted:tasks.every(task=>task.success),
    allProvidersConfirmed:tasks.every(task=>task.published),
  };
  fs.writeFileSync(path.join(directory,'provider-verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>require('firebase-admin').app().delete());
