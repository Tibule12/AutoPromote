const multer = require("multer");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

// Multipart media is spooled to owned scratch, never accumulated by Multer in
// the API heap. The request owns cleanup on success, rejection or disconnect.
function temporaryMediaUpload(maxBytes, { fileFilter } = {}) {
  const directories = Symbol("mediaDirectories");
  return multer({
    storage: multer.diskStorage({
      destination(req, _file, callback) {
        fsp.mkdtemp(path.join(os.tmpdir(), "autopromote-upload-")).then(directory => {
          if ((req.destroyed && !req.complete) || req.res.destroyed) {
            void fsp.rm(directory, { recursive: true, force: true });
            return callback(new Error("Upload disconnected"));
          }
          if (!req[directories]) {
            req[directories] = new Set();
            const cleanup = () =>
              Promise.all(
                [...req[directories]].map(dir =>
                  fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
                )
              );
            req.res.once("finish", cleanup);
            req.res.once("close", cleanup);
          }
          req[directories].add(directory);
          callback(null, directory);
        }, callback);
      },
      filename: (_req, _file, callback) => callback(null, "source"),
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter,
  });
}

function temporarySourcePath(value) {
  // Reconstruct from a single scratch-directory component and a fixed name.
  // Never pass Multer's request-derived path directly to filesystem APIs.
  if (typeof value !== "string") throw new Error("Invalid temporary media path");
  const directory = path.basename(path.dirname(value));
  if (!/^autopromote-upload-[A-Za-z0-9]{6}$/.test(directory))
    throw new Error("Invalid temporary media directory");
  const trusted = path.join(os.tmpdir(), directory, "source");
  if (value !== trusted) throw new Error("Invalid temporary media path");
  return trusted;
}

async function fileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

module.exports = { temporaryMediaUpload, temporarySourcePath, fileSha256 };
