const { directContentSource } = require("./contentSource");

function ownedPath(item) {
  if (item.storagePath) return item.storagePath;
  // The normal route already loads Firebase; defer it for the small pure unit test.
  return require("./cleanupSource").extractOwnedStoragePathFromUrl(item.url);
}

// Storage checks are read-only and opt-in for the Publisher asset picker. The
// ordinary dashboard content endpoint does not incur these metadata requests.
async function enrichPublisherAssets(items, bucket, { limit = 120, concurrency = 8 } = {}) {
  const paths = new Map();
  for (const item of items.slice(0, limit)) {
    const path = ownedPath(item);
    if (path && path.startsWith("uploads/") && !paths.has(path)) paths.set(path, null);
  }
  const keys = [...paths.keys()];
  for (let start = 0; start < keys.length; start += concurrency) {
    await Promise.all(keys.slice(start, start + concurrency).map(async path => {
      try {
        const [metadata] = await bucket.file(path).getMetadata();
        paths.set(path, metadata || null);
      } catch (_) { /* Missing or inaccessible objects keep their content record. */ }
    }));
  }
  return items.map(item => {
    const path = ownedPath(item);
    const metadata = paths.get(path);
    if (!metadata) return item;
    const storageSource = directContentSource(metadata.metadata || {});
    return {
      ...item,
      ...(metadata.md5Hash ? { mediaHash: item.mediaHash || `md5:${metadata.md5Hash}` } : {}),
      ...(!item.source && storageSource ? { source: storageSource } : {}),
    };
  });
}

module.exports = { enrichPublisherAssets };
