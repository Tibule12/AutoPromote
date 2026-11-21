const fs = require("node:fs");
const { Readable } = require("node:stream");
const { withStagedMedia } = require("../stagedMedia");
const { transfers } = require("../mediaTransferBudget");

test("stages a large unknown-length source without calling a buffering API", async () => {
  let filePath;
  const chunk = Buffer.alloc(64 * 1024, 31);
  const source = new Readable({
    read() {
      if (!this.remaining) return this.push(null);
      this.remaining--;
      this.push(chunk);
    },
  });
  source.remaining = 2048;
  const arrayBuffer = jest.fn(() => {
    throw new Error("whole-file read forbidden");
  });
  await withStagedMedia(
    { source: async () => ({ ok: true, body: source, arrayBuffer }) },
    async staged => {
      filePath = staged.filePath;
      expect(staged.bytes).toBe(128 * 1024 ** 2);
      expect(fs.statSync(filePath).size).toBe(staged.bytes);
    }
  );
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(fs.existsSync(filePath)).toBe(false);
  expect(transfers.snapshot().active).toBe(0);
});

test("consumer failure cleans disk, aborts open readers and releases admission", async () => {
  let filePath, reader;
  await expect(
    withStagedMedia(
      { source: async () => ({ ok: true, body: Readable.from([Buffer.alloc(64)]) }) },
      async staged => {
        filePath = staged.filePath;
        reader = fs.createReadStream(filePath, { signal: staged.signal });
        reader.on("error", () => {});
        throw new Error("provider disconnected");
      }
    )
  ).rejects.toThrow("provider disconnected");
  expect(fs.existsSync(filePath)).toBe(false);
  expect(reader.destroyed).toBe(true);
  expect(transfers.snapshot().active).toBe(0);
});

test("chunked oversized media stops at the byte limit", async () => {
  const consume = jest.fn();
  await expect(
    withStagedMedia(
      { maxBytes: 8, source: async () => ({ ok: true, body: Readable.from([Buffer.alloc(9)]) }) },
      consume
    )
  ).rejects.toMatchObject({ status: 413 });
  expect(consume).not.toHaveBeenCalled();
  expect(transfers.snapshot().active).toBe(0);
});
