const express = require("express");
const request = require("supertest");

process.env.FIREBASE_ADMIN_BYPASS = "1";
process.env.NO_VIRAL_OPTIMIZATION = "true";

const { admin } = require("../src/firebaseAdmin");
const contentRoutes = require("../src/contentRoutes");

describe("content source upload route", () => {
  let app;
  let saveMock;
  let fileMock;

  beforeEach(() => {
    saveMock = jest.fn().mockResolvedValue(undefined);
    fileMock = jest.fn(() => ({ save: saveMock }));
    admin.storage = () => ({
      bucket: () => ({
        name: "test-bucket.appspot.com",
        file: fileMock,
      }),
    });

    app = express();
    app.use("/api/content", contentRoutes);
  });

  test("POST /api/content/upload/source-file accepts a raw upload without custom headers", async () => {
    const payload = Buffer.from("video-data");
    const res = await request(app)
      .post("/api/content/upload/source-file?mediaType=video&fileName=bad%20name%3F.mp4")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .set("Content-Type", "video/mp4")
      .send(payload)
      .expect(201);

    expect(fileMock).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/videos\/\d+_bad name-.mp4$/));
    expect(saveMock).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        resumable: false,
        contentType: "video/mp4",
        metadata: expect.objectContaining({
          metadata: expect.objectContaining({
            firebaseStorageDownloadTokens: expect.any(String),
            ownerUid: "testUser123",
            source: "unified_publisher_backend_upload",
          }),
        }),
      })
    );
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        size: payload.length,
        storagePath: expect.stringMatching(/^uploads\/videos\/\d+_bad name-.mp4$/),
        url: expect.stringContaining(
          "https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/uploads%2Fvideos%2F"
        ),
      })
    );
  });

  test("POST /api/content/upload/source-file rejects unsupported media types", async () => {
    const res = await request(app)
      .post("/api/content/upload/source-file?mediaType=document")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("payload"))
      .expect(400);

    expect(res.body).toEqual(expect.objectContaining({ error: "Invalid media type" }));
    expect(fileMock).not.toHaveBeenCalled();
  });
});