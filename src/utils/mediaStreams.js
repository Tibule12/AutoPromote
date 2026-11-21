const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

function nodeReadable(body) {
  if (body && typeof body.pipe === "function") return body;
  if (body && typeof body.getReader === "function") return Readable.fromWeb(body);
  throw new Error("Media response has no readable stream");
}

function byteCounter(maxBytes, { minBytes = 1, expectedBytes } = {}) {
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes)
        return callback(
          Object.assign(new Error("File too large"), { status: 413, errorClass: "validation" })
        );
      callback(null, chunk);
    },
    flush(callback) {
      if (bytes < minBytes)
        return callback(
          Object.assign(new Error("Missing upload body"), { status: 400, errorClass: "validation" })
        );
      if (Number.isFinite(expectedBytes) && bytes !== expectedBytes)
        return callback(
          Object.assign(new Error("Media byte count does not match its declared length"), {
            status: 400,
            errorClass: "validation",
          })
        );
      callback();
    },
  });
  stream.byteCount = () => bytes;
  return stream;
}

async function streamStorageUpload(
  req,
  file,
  options,
  { maxBytes = 500 * 1024 * 1024, timeoutMs = 180000 } = {}
) {
  const expectedBytes =
    req.headers?.["content-length"] === undefined
      ? undefined
      : Number(req.headers["content-length"]);
  if (expectedBytes > maxBytes)
    throw Object.assign(new Error("File too large"), { status: 413, errorClass: "validation" });
  const counter = byteCounter(maxBytes, { expectedBytes });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const abandoned = () => {
    if (!req.complete && req.destroyed) controller.abort();
  };
  const failed = error => counter.destroy(error);
  req.once("close", abandoned);
  req.once("error", failed);
  try {
    // Do not pipeline the request itself: validation failures must still be
    // able to return an HTTP error instead of destroying the response socket.
    req.pipe(counter);
    await pipeline(counter, file.createWriteStream({ ...options, resumable: true }), {
      signal: controller.signal,
    });
    return counter.byteCount();
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    req.unpipe(counter);
    req.removeListener("close", abandoned);
    req.removeListener("error", failed);
    if (!req.readableEnded && !req.destroyed) req.resume();
  }
}

module.exports = { nodeReadable, byteCounter, streamStorageUpload };
