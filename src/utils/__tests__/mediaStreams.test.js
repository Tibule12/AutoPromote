const { Readable, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { nodeReadable, byteCounter, streamStorageUpload } = require("../mediaStreams");

test("native fetch Web streams download without a full-body allocation", async () => {
  const parts = [];
  const body = Readable.toWeb(Readable.from([Buffer.from("a"), Buffer.from("b")]));
  await pipeline(
    nodeReadable(body),
    new Writable({
      write(c, _e, next) {
        parts.push(c);
        next();
      },
    })
  );
  expect(Buffer.concat(parts).toString()).toBe("ab");
});

test("rejects a chunked source as soon as its byte limit is exceeded", async () => {
  const counter = byteCounter(5);
  await expect(
    pipeline(
      Readable.from([Buffer.from("123"), Buffer.from("456")]),
      counter,
      new Writable({
        write(_c, _e, next) {
          next();
        },
      })
    )
  ).rejects.toMatchObject({ status: 413 });
});

test("source storage streaming keeps its backlog bounded for a slow storage sink", async () => {
  const size = 64 * 1024,
    count = 2048;
  let produced = 0,
    consumed = 0,
    maxAhead = 0;
  const req = new Readable({
    highWaterMark: size,
    read() {
      if (produced === count) return this.push(null);
      produced++;
      maxAhead = Math.max(maxAhead, produced - consumed);
      this.push(Buffer.alloc(size));
    },
  });
  req.headers = { "content-length": String(size * count) };
  req.complete = true;
  const file = {
    createWriteStream: () =>
      new Writable({
        highWaterMark: size,
        write(c, _e, next) {
          consumed += c.length / size;
          setImmediate(next);
        },
      }),
    delete: jest.fn(async () => {}),
  };
  expect(await streamStorageUpload(req, file, {})).toBe(size * count);
  expect(maxAhead).toBeLessThan(10);
  expect(file.delete).not.toHaveBeenCalled();
});

test("failed storage uploads delete partial objects and release their source", async () => {
  const req = Readable.from([Buffer.from("incomplete")]);
  req.headers = {};
  req.complete = true;
  const file = {
    createWriteStream: () =>
      new Writable({
        write(_c, _e, next) {
          next(Error("storage failed"));
        },
      }),
    delete: jest.fn(async () => {}),
  };
  await expect(streamStorageUpload(req, file, {})).rejects.toThrow("storage failed");
  expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
});

test("oversized declared uploads are rejected before opening a storage stream", async () => {
  const req = Readable.from([]);
  req.headers = { "content-length": "100" };
  const file = { createWriteStream: jest.fn() };
  await expect(streamStorageUpload(req, file, {}, { maxBytes: 10 })).rejects.toMatchObject({
    status: 413,
  });
  expect(file.createWriteStream).not.toHaveBeenCalled();
});
