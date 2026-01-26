/*
Create a temporary content doc with the given URL and UID, then run the PULL_FROM_URL publish test.
Usage: node -r dotenv/config scripts/create-content-and-run-pull.js --url <videoUrl> --uid <uid> [--title "Test video"]

This script leaves the created doc in place and marks it with `testing: true` so it can be inspected.
*/

const argv = require('minimist')(process.argv.slice(2));
const url = argv.url || argv.u;
const uid = argv.uid || argv.u || process.env.TEST_UID;
const title = argv.title || argv.t || 'E2E TikTok test video (SELF_ONLY)';

if (!url || !uid) {
  console.error('Usage: node scripts/create-content-and-run-pull.js --url <videoUrl> --uid <uid> [--title <title>]');
  process.exit(1);
}

(async () => {
  try {
    const { db, admin } = require('../src/firebaseAdmin');
    console.log('Creating content doc for uid=', uid, 'url=', url.slice(0, 120));
    const docRef = await db.collection('content').add({
      title,
      url,
      userId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      testing: true,
    });
    const contentId = docRef.id;
    console.log('Created content:', contentId);

    // Run the pull-from-url script which will init + poll and write result back to the content doc
    console.log('Running pull-from-url test (SELF_ONLY privacy)');
    const { execFileSync } = require('child_process');
    try {
      if (process.env.TIKTOK_FORCE_FILE_UPLOAD === '1') {
        console.log('TIKTOK_FORCE_FILE_UPLOAD=1 -> running file-upload fallback instead of pull');
        execFileSync(process.execPath, ['scripts/tiktok-file-upload-fallback.js', contentId], { stdio: 'inherit' });
      } else {
        execFileSync(process.execPath, ['scripts/tiktok-pull-from-url.js', contentId], { stdio: 'inherit' });
      }
    } catch (e) {
      console.error('Pull-from-url (or fallback) script failed:', e && (e.message || e));
      // Fetch doc to show any partial status
      try {
        const snap = await db.collection('content').doc(contentId).get();
        console.log('Content doc snapshot after failure:', snap.exists ? JSON.stringify(snap.data(), null, 2) : '<no-doc>');
      } catch (_) {}
      process.exit(2);
    }

    // Read back the content doc and print the tiktok field (if any)
    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) {
      console.error('Content doc vanished unexpectedly');
      process.exit(3);
    }
    const data = snap.data();
    console.log('Final content doc:', JSON.stringify({ id: contentId, tiktok: data.tiktok || null }, null, 2));
    if (data.tiktok && data.tiktok.status) {
      console.log('Publish status:', data.tiktok.status);
      process.exit(0);
    }
    console.log('No publish status recorded on content doc; check logs/artifact for details.');
    process.exit(4);
  } catch (e) {
    console.error('Unexpected failure:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();
