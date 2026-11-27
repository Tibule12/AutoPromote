const { Readable } = require("node:stream");
const fs = require("node:fs");
const { safeFetch } = require("../ssrfGuard");
const { streamLinkedInVideo } = require("../streamLinkedInVideo");

jest.mock("../ssrfGuard", () => ({ safeFetch: jest.fn() }));
afterEach(() => jest.resetAllMocks());

test("streams a large Google video with bounded backpressure and exact size", async () => {
  const chunk = Buffer.alloc(64 * 1024, 17), count = 2048;
  let produced = 0, consumed = 0, maxAhead = 0;
  const source = new Readable({
    highWaterMark: chunk.length,
    read() {
      if (produced === count) return this.push(null);
      produced++;
      maxAhead = Math.max(maxAhead, produced - consumed);
      this.push(chunk);
    },
  });
  const arrayBuffer = jest.fn(() => { throw Error("Must not buffer the video"); });
  safeFetch.mockResolvedValueOnce({ ok: true, body: source, arrayBuffer,
    headers: { get: () => String(chunk.length * count) } });
  safeFetch.mockImplementationOnce(async (_url, _fetch, { fetchOptions: opts }) => {
    expect(opts.headers["Content-Length"]).toBe(String(chunk.length * count));
    expect(opts.duplex).toBe("half");
    let bytes = 0;
    for await (const part of opts.body) {
      bytes += part.length;
      consumed += part.length / chunk.length;
      await new Promise(resolve => setImmediate(resolve));
    }
    expect(bytes).toBe(chunk.length * count);
    return { ok: true, status: 201 };
  });
  await expect(streamLinkedInVideo({ videoUrl: "https://storage.googleapis.com/b/video.mp4",
    uploadUrl: "https://www.linkedin.com/upload", accessToken: "test", fetchImpl: jest.fn() }))
    .resolves.toEqual({ bytes: 128 * 1024 * 1024 });
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(maxAhead).toBeLessThan(8);
  expect(source.destroyed).toBe(true);
});

test("stages unknown-length responses on disk and removes the file after upload", async () => {
  let staged;
  safeFetch.mockResolvedValueOnce({ ok: true, body: Readable.toWeb(Readable.from([Buffer.from("video-data")])),
    headers: { get: () => null } });
  safeFetch.mockImplementationOnce(async (_url, _fetch, { fetchOptions: opts }) => {
    staged = opts.body.path;
    expect(fs.existsSync(staged)).toBe(true);
    expect(opts.headers["Content-Length"]).toBe("10");
    for await (const _ of opts.body) { /* drain stream */ }
    return { ok: true, status: 201 };
  });
  await streamLinkedInVideo({ videoUrl: "https://storage.googleapis.com/b/video.mp4",
    uploadUrl: "https://www.linkedin.com/upload", accessToken: "test", fetchImpl: jest.fn() });
  expect(fs.existsSync(staged)).toBe(false);
});

test("destroys the source when the upload fails", async () => {
  const body = Readable.from([Buffer.alloc(100)]);
  safeFetch.mockResolvedValueOnce({ ok: true, body, headers: { get: () => "100" } });
  safeFetch.mockRejectedValueOnce(new Error("connection reset"));
  await expect(streamLinkedInVideo({ videoUrl: "https://storage.googleapis.com/b/video.mp4",
    uploadUrl: "https://www.linkedin.com/upload", accessToken: "test", fetchImpl: jest.fn() }))
    .rejects.toThrow("connection reset");
  expect(body.destroyed).toBe(true);
});
