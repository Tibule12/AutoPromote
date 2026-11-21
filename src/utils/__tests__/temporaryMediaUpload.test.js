const express = require("express");
const request = require("supertest");
const fs = require("node:fs/promises");
const { temporaryMediaUpload, temporarySourcePath, fileSha256 } = require("../temporaryMediaUpload");

test("multipart bytes remain on disk and are removed on a rejected request", async () => {
  const app = express();
  let file;
  app.post("/upload", require("express-rate-limit")({ windowMs: 60000, max: 20 }), temporaryMediaUpload(1024).single("file"), async (req, res) => {
    file = temporarySourcePath(req.file.path);
    expect(req.file.buffer).toBeUndefined();
    expect(await fs.readFile(file, "utf8")).toBe("source-video");
    expect(await fileSha256(file)).toBe(
      require("crypto").createHash("sha256").update("source-video").digest("hex")
    );
    res.status(400).json({ invalidAnchors: true });
  });
  await request(app)
    .post("/upload")
    .attach("file", Buffer.from("source-video"), "input.mp4")
    .expect(400);
  for (let i = 0; i < 30; i++) {
    try {
      await fs.stat(file);
      await new Promise(r => setTimeout(r, 10));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
  throw Error("Temporary upload was not removed");
});

test.each([
  "/etc/passwd",
  "/tmp/autopromote-upload-ABC123/../secret",
  "/tmp/autopromote-upload-ABC123/source.mp4",
  "relative/autopromote-upload-ABC123/source",
])("rejects an unowned or noncanonical multipart source path: %s", value => {
  expect(() => temporarySourcePath(value)).toThrow("Invalid temporary media");
});
