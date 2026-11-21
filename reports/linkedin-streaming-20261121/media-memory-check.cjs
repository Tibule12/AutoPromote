// Isolated synthetic transfer check. No credentials, network or provider calls.
const fs = require("node:fs");
const path = require("node:path");
const { Readable, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { withStagedMedia } = require("../../src/utils/stagedMedia");
const { transfers } = require("../../src/utils/mediaTransferBudget");

(async () => {
  const started = Date.now(), baseline = process.memoryUsage().rss;
  let peak = baseline, admitted = 0, notifyReady, releaseConsumers, rejectedStatus;
  const ready = new Promise(resolve => { notifyReady = resolve; });
  const hold = new Promise(resolve => { releaseConsumers = resolve; });
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  let consumed = 0;
  const operation = () => withStagedMedia({ source: async () => ({
    ok: true,
    body: Readable.from((function* () {
      const chunk = Buffer.alloc(64 * 1024, 23);
      for (let i = 0; i < 2048; i++) yield chunk;
    })()),
  }) }, async ({ filePath, bytes, signal }) => {
    if (++admitted === 2) notifyReady();
    await hold;
    await pipeline(fs.createReadStream(filePath, { signal }), new Writable({
      write(chunk, _encoding, callback) { consumed += chunk.length; setImmediate(callback); },
    }));
    return bytes;
  });
  try {
    const runs = Promise.all([operation(), operation()]);
    await ready;
    try { await operation(); } catch (error) { rejectedStatus = error.status; }
    releaseConsumers();
    const sizes = await runs;
    peak = Math.max(peak, process.memoryUsage().rss);
    const result = {
      checkedAt: new Date().toISOString(), mode: "isolated synthetic disk-backed transfer; no production load claim",
      concurrentTransfers: sizes.length, bytesPerTransfer: sizes[0], totalConsumedBytes: consumed,
      baselineRssBytes: baseline, peakRssBytes: peak, rssGrowthBytes: peak - baseline,
      thirdTransferStatus: rejectedStatus, activeAfterCleanup: transfers.snapshot().active,
      elapsedMs: Date.now() - started,
    };
    if (sizes.some(bytes => bytes !== 128 * 1024 ** 2) || consumed !== 256 * 1024 ** 2 ||
        rejectedStatus !== 503 || result.activeAfterCleanup || peak > 384 * 1024 ** 2)
      throw new Error("Transfer bound/concurrency check failed");
    fs.writeFileSync(path.join(__dirname, "media-memory-check.json"), JSON.stringify(result, null, 2) + "\n");
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally { releaseConsumers(); clearInterval(sample); }
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
