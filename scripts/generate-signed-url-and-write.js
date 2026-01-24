/*
Generates a signed read URL for the given content id and writes it to Firestore
Usage: node -r dotenv/config scripts/generate-signed-url-and-write.js KM9rCHI8pV0BuDOzZF6l
Requires GOOGLE_APPLICATION_CREDENTIALS to point to a service account JSON (or FIREBASE_SERVICE_ACCOUNT_* env handled by startup bootstrap)
*/

const { Storage } = require('@google-cloud/storage');
const { db } = require('../src/firebaseAdmin');

async function main() {
  const contentId = process.argv[2];
  if (!contentId) {
    console.error('Usage: node scripts/generate-signed-url-and-write.js <contentId>');
    process.exit(1);
  }

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    console.error('FIREBASE_STORAGE_BUCKET not set in env');
    process.exit(1);
  }

  const storage = new Storage();
  // This script assumes content docs store path under `uploads/videos/<filename>` in `content.storagePath` or similar.
  const contentDoc = await db.collection('content').doc(contentId).get();
  if (!contentDoc.exists) {
    console.error('content doc not found:', contentId);
    process.exit(1);
  }
  const data = contentDoc.data();
  // Try to find a storage path in common fields
  const pathCandidates = [data.storagePath, data.path, (data.upload && data.upload.path), data.filename];
  let storagePath = pathCandidates.find(Boolean);
  if (!storagePath && data.url && typeof data.url === 'string') {
    try {
      // Attempt to extract the object path from an existing signed URL
      // e.g. https://storage.googleapis.com/<bucket>/uploads/videos/..?.. -> /uploads/videos/...
      const u = new URL(data.url);
      const hostParts = u.hostname.split('.');
      // If url is storage.googleapis.com or bucket-hosted, path begins after bucket name
      const pathname = decodeURIComponent(u.pathname || '');
      // If pathname starts with /<bucket>/..., strip leading /<bucket>
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        // remove the bucket name
        parts.shift();
        storagePath = parts.join('/');
      } else {
        storagePath = pathname.replace(/^\//, '');
      }
      console.log('Inferred storagePath from url:', storagePath);
    } catch (e) {
      // ignore
    }
  }
  if (!storagePath) {
    console.error('No storage path found in content doc. Fields checked:', pathCandidates);
    console.error('Content doc data keys:', Object.keys(data));
    process.exit(1);
  }
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(storagePath);

  const expiresSeconds = 60 * 60; // 1 hour
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresSeconds * 1000,
  });

  console.log('Generated signed url (truncated):', url.slice(0, 200));

  await db.collection('content').doc(contentId).update({ url, urlSignedAt: new Date().toISOString() });
  console.log('Wrote signed url to content.' + contentId + '.url');
}

main().catch(err => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
