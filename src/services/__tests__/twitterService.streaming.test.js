const { Readable, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const fs = require("node:fs");
jest.mock("node-fetch", () => jest.fn());
jest.mock("../../utils/ssrfGuard", () => ({ safeFetch: jest.fn() }));
jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ access_token: "fixture", expires_at: Date.now() + 3600000 }),
            }),
          }),
        }),
      }),
    }),
  },
  admin: {},
}));
const fetch = require("node-fetch");
const { safeFetch } = require("../../utils/ssrfGuard");
const { uploadMedia } = require("../twitterService");

test("X uploads sequential 5 MiB segments from disk and removes scratch", async () => {
  const previous = process.env.TWITTER_CLIENT_ID;
  process.env.TWITTER_CLIENT_ID = "fixture";
  const total = 11 * 1024 ** 2;
  let sourcePath;
  const segments = [];
  safeFetch.mockImplementation(async (url, _fetch, options) => {
    if (new URL(url).hostname === "storage.googleapis.com")
      return {
        ok: true,
        body: Readable.from(
          (function* () {
            for (let i = 0; i < 176; i++) yield Buffer.alloc(64 * 1024);
          })()
        ),
      };
    const command = options.fetchOptions.body.get("command");
    if (command === "INIT")
      expect(options.fetchOptions.body.get("total_bytes")).toBe(String(total));
    return { ok: true, text: async () => JSON.stringify({ media_id_string: "one-media" }) };
  });
  fetch.mockImplementation(async (_url, options) => {
    let bytes = 0;
    // FormData's source stream retains its exact file range and known length.
    const file = options.body._streams.find(item => item?.source?.path)?.source;
    sourcePath = file.path;
    expect(fs.existsSync(sourcePath)).toBe(true);
    await pipeline(
      options.body,
      new Writable({
        write(chunk, _enc, callback) {
          bytes += chunk.length;
          callback();
        },
      })
    );
    const mediaBytes = file.end - file.start + 1;
    expect(bytes).toBeGreaterThan(mediaBytes); // multipart boundaries and text fields
    segments.push(mediaBytes);
    return { ok: true };
  });
  try {
    await expect(
      uploadMedia({
        uid: "owner",
        mediaUrl: "https://storage.googleapis.com/b/movie.mp4",
        mediaType: "video/mp4",
      })
    ).resolves.toBe("one-media");
    expect(segments).toEqual([5 * 1024 ** 2, 5 * 1024 ** 2, 1024 ** 2]);
    expect(fs.existsSync(sourcePath)).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.TWITTER_CLIENT_ID;
    else process.env.TWITTER_CLIENT_ID = previous;
  }
});
