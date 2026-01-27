// Creates a larger test MP4 by repeating a small sample until target size and uploads it.
// Usage: node -r dotenv/config scripts/create-large-tiktok-test-asset.js

(async () => {
  try {
    const fetch = global.fetch || require('node-fetch');
    const { Storage } = require('@google-cloud/storage');
    const { saveFileSafely } = require('../src/utils/storageGuard');
    const source = 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';
    console.log('Downloading', source);
    const resp = await fetch(source, { redirect: 'follow' });
    if (!resp.ok) throw new Error('download failed: ' + resp.status);
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    const targetSize = 8 * 1024 * 1024; // 8 MB
    let out = Buffer.alloc(0);
    while (out.length < targetSize) out = Buffer.concat([out, buf]);

    const storage = new Storage();
    const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const destPath = `test-assets/tiktok/e2e-large-${Date.now()}.mp4`;
    const file = bucket.file(destPath);
    console.log('Uploading', destPath, 'size=', out.length);
    await saveFileSafely(file, out, { contentType: 'video/mp4', resumable: false });

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    console.log('SIGNED_URL_JSON=' + JSON.stringify({ signedUrl, storagePath: destPath, bucket: process.env.FIREBASE_STORAGE_BUCKET }));
  } catch (e) {
    console.error(e && (e.stack || e.message || e));
    process.exit(1);
  }
})();
