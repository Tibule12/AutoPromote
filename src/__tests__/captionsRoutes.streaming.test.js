const fs = require("node:fs/promises");
const express = require("express");
const request = require("supertest");
jest.mock("../services/captionsService", () => ({ createCaptions: jest.fn(), generateTranscription: jest.fn() }));
jest.mock("../services/auditLogger", () => ({ audit: { log: jest.fn() } }));
const { generateTranscription } = require("../services/captionsService");
const router = require("../routes/captionsRoutes");

test("transcription receives a temporary file and its original media metadata", async () => {
  let input;
  generateTranscription.mockImplementation(async (filePath, info) => {
    input = filePath;
    expect(typeof filePath).toBe("string");
    expect(await fs.readFile(filePath, "utf8")).toBe("sound-source");
    expect(info).toEqual({ filename: "recording.mp4", contentType: "video/mp4" });
    return { text: "Speech", segments: [], language: "en" };
  });
  const app = express();
  app.use((req, _res, next) => { req.user = { uid: "owner" }; next(); });
  app.use("/captions", router);
  const result = await request(app).post("/captions/transcribe")
    .attach("file", Buffer.from("sound-source"), { filename: "recording.mp4", contentType: "video/mp4" }).expect(200);
  expect(result.body.text).toBe("Speech");
  for (let i = 0; i < 50; i++) {
    try { await fs.stat(input); await new Promise(resolve => setTimeout(resolve, 5)); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
  throw new Error("Transcription scratch file was retained");
});
