const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { safeFetch } = require("./ssrfGuard");
const { nodeReadable, byteCounter } = require("./mediaStreams");
const { transfers } = require("./mediaTransferBudget");

// Disk staging gives multipart providers a known length without retaining the
// movie in the heap. The same deadline and admission slot cover the consumer.
async function withStagedMedia(
  { url, fetchImpl, source, maxBytes = 2 * 1024 ** 3, timeoutMs = 180000 },
  consume
) {
  const release = transfers.acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let directory, body;
  try {
    directory = await fsp.mkdtemp(path.join(os.tmpdir(), "autopromote-transfer-"));
    const response = source
      ? await source(controller.signal)
      : await safeFetch(url, fetchImpl, {
          requireHttps: true,
          fetchOptions: { signal: controller.signal, headers: { "Accept-Encoding": "identity" } },
        });
    if (!response.ok) throw new Error(`Media download failed (HTTP ${response.status})`);
    body = nodeReadable(response.body);
    const lengthHeader = response.headers?.get?.("content-length");
    const length = lengthHeader == null ? undefined : Number(lengthHeader);
    const filePath = path.join(directory, "media");
    const counter = byteCounter(maxBytes, { expectedBytes: length });
    await pipeline(body, counter, fs.createWriteStream(filePath, { mode: 0o600 }), {
      signal: controller.signal,
    });
    return await consume({ filePath, bytes: counter.byteCount(), signal: controller.signal });
  } finally {
    clearTimeout(timer);
    controller.abort();
    body?.destroy();
    try {
      if (directory) await fsp.rm(directory, { recursive: true, force: true });
    } finally {
      release();
    }
  }
}

module.exports = { withStagedMedia };
