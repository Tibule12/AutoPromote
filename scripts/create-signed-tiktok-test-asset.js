// Uploads a test MP4 to Firebase Storage and prints a signed URL (v4)
// Usage: node scripts/create-signed-tiktok-test-asset.js --source <url> --destPath <path>

const { Storage } = require('@google-cloud/storage');
const fetch = global.fetch || require('node-fetch');
const argv = require('minimist')(process.argv.slice(2));

async function main() {
  const source = argv.source || 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';
  const destPath = argv.destPath || `test-assets/tiktok/e2e-${Date.now()}.mp4`;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    console.error('FIREBASE_STORAGE_BUCKET not set. Aborting.');
    process.exit(1);
  }

  console.log('Downloading source:', source);
  const res = await fetch(source, { redirect: 'follow' });
  if (!res.ok) throw new Error('Failed to download source: ' + res.status);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destPath);

  console.log('Uploading to:', `${bucketName}/${destPath}`);
  await file.save(buf, { contentType: 'video/mp4', resumable: false });

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  // Print JSON to make it easy to parse in workflows
  const out = { signedUrl, storagePath: destPath, bucket: bucketName };
  console.log('SIGNED_URL_JSON=' + JSON.stringify(out));
  // also write to stdout plainly for easy grepping
  console.log('SIGNED_URL=' + signedUrl);
}

main().catch(err => {
  console.error(err && (err.stack || err.message || err));
  process.exit(1);
});