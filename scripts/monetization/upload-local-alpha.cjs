// Firebase emulator's native resumable protocol; the GCS emulator finalizes
// each PUT and does not implement GCS partial Content-Range semantics.
const fs = require("node:fs/promises"), crypto = require("node:crypto");
module.exports = async function uploadLocalAlpha({ file, options, bucket, origin, cohort }) {
  require("../../src/services/unifiedCredits/runtime").assertSandbox();
  const base = new URL(origin);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || process.env.STUDIO_3D_LOCAL_ENABLED !== "true") throw Error("Local alpha transport requires owned loopback emulators");
  const destination = options.destination, metadata = options.metadata, uid = metadata?.metadata?.ownerUid;
  if (!cohort.includes(uid) || !new RegExp(`^temp_studio_3d/${uid}/[A-Za-z0-9_-]{8,100}/overlay\\.mov$`).test(destination) || metadata.contentType !== "video/quicktime") throw Error("Invalid owned local alpha destination");
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 250 * 1024 ** 2) throw Error("Local alpha exceeds its existing bound");
  const bytes = await fs.readFile(file), sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== metadata.metadata.sha256) throw Error("Local alpha changed before upload");
  const start = new URL(`/v0/b/${bucket.name}/o`, base); start.searchParams.set("name", destination);
  const response = await fetch(start, { method: "POST", signal: AbortSignal.timeout(30000), headers: {
    Authorization: "Bearer owner", "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
    "X-Goog-Upload-Header-Content-Length": String(bytes.length), "X-Goog-Upload-Header-Content-Type": metadata.contentType,
  }, body: JSON.stringify({ name: destination, contentType: metadata.contentType, metadata: metadata.metadata }) });
  const upload = new URL(response.headers.get("x-goog-upload-url") || "invalid", base);
  if (!response.ok || upload.origin !== base.origin || upload.pathname !== start.pathname || upload.searchParams.get("name") !== destination) throw Error("Local alpha upload session failed");
  const chunkSize = 8 * 1024 ** 2;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.length);
    const chunk = await fetch(upload, { method: "POST", signal: AbortSignal.timeout(60000), headers: {
      Authorization: "Bearer owner", "Content-Type": "application/octet-stream", "X-Goog-Upload-Command": end === bytes.length ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": String(offset),
    }, body: bytes.subarray(offset, end) });
    if (!chunk.ok) throw Error(`Local alpha chunk failed with HTTP ${chunk.status}`);
  }
  const stored = bucket.file(destination), [info] = await stored.getMetadata(), [downloaded] = await stored.download();
  if (Number(info.size) !== bytes.length || crypto.createHash("sha256").update(downloaded).digest("hex") !== sha256) throw Error("Uploaded local alpha bytes do not match the verified worker artifact");
  return [stored, info];
};
