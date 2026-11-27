const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { safeFetch } = require("./ssrfGuard");
const { transfers } = require("./mediaTransferBudget");
const { byteCounter } = require("./mediaStreams");

// Keep video bytes out of the server heap. Google sources expose their size;
// unknown-length sources are staged on disk so LinkedIn still gets a length.
async function streamLinkedInVideo({
  videoUrl,
  uploadUrl,
  accessToken,
  fetchImpl,
  timeoutMs = 180000,
  maxBytes = 2 * 1024 * 1024 * 1024,
}) {
  const release = transfers.acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let source, body, directory;
  try {
    source = await safeFetch(videoUrl, fetchImpl, {
      requireHttps: true,
      fetchOptions: { signal: controller.signal, headers: { "Accept-Encoding": "identity" } },
    });
    if (!source.ok || !source.body) throw new Error("Failed to download video for LinkedIn upload");
    body = typeof source.body.pipe === "function" ? source.body : Readable.fromWeb(source.body);
    let length = Number(source.headers?.get?.("content-length"));
    if (length > maxBytes)
      throw Object.assign(new Error("LinkedIn media file is too large"), {
        status: 413,
        errorClass: "validation",
      });
    if (!Number.isSafeInteger(length) || length <= 0) {
      directory = await fsp.mkdtemp(path.join(os.tmpdir(), "autopromote-linkedin-"));
      const file = path.join(directory, "video");
      await pipeline(body, byteCounter(maxBytes), fs.createWriteStream(file), {
        signal: controller.signal,
      });
      length = (await fsp.stat(file)).size;
      body = fs.createReadStream(file);
    }
    const response = await safeFetch(uploadUrl, fetchImpl, {
      requireHttps: true,
      allowHosts: ["linkedin.com", "licdn.com"],
      fetchOptions: {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(length),
        },
        body,
        duplex: "half",
        signal: controller.signal,
      },
    });
    if (!response.ok)
      throw new Error(`Failed to upload video bytes to LinkedIn (HTTP ${response.status})`);
    return { bytes: length };
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

module.exports = { streamLinkedInVideo };
