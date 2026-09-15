const express = require("express");
const request = require("supertest");
const mockSave = jest.fn().mockResolvedValue();
const mockDelete = jest.fn().mockResolvedValue();
const mockSignedUrl = jest.fn().mockResolvedValue(["https://storage.example.test/tracking-source"]);
const mockFile = jest.fn(() => ({ save: mockSave, delete: mockDelete, getSignedUrl: mockSignedUrl }));
jest.mock("../src/authMiddleware", () => (req, res, next) => { req.user = { uid: "tracking-user" }; next(); });
jest.mock("../src/creditSystem", () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(), getCreditBreakdown: jest.fn() }));
jest.mock("../src/services/billingService", () => ({ getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ testerAccess: null }) }));
jest.mock("../src/services/videoEditingService", () => jest.fn().mockImplementation(() => ({})));
jest.mock("../src/utils/cloudRunAuth", () => ({ buildWorkerRequestConfig: jest.fn().mockResolvedValue({ timeout: 180000 }) }));
jest.mock("firebase-admin", () => ({ storage: () => ({ bucket: () => ({ file: mockFile }) }), firestore: jest.fn() }));
jest.mock("axios", () => ({ post: jest.fn() }));
const axios = require("axios");
const routes = require("../src/mediaRoutes");
const app = express();
app.use("/api/media", routes);
const send = anchors => request(app).post("/api/media/track-studio-faces")
  .field("anchors", typeof anchors === "string" ? anchors : JSON.stringify(anchors))
  .field("start", "0").field("end", "60").attach("file", Buffer.from("fixture-video"), "source.mp4");

beforeEach(() => jest.clearAllMocks());

test("forwards authenticated face analysis and deletes its temporary upload", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, reviewRequired: true } });
  const response = await send({ solo: { x: 34, y: 47 } }).expect(200);
  expect(response.body.reviewRequired).toBe(true);
  expect(mockFile).toHaveBeenCalledWith(expect.stringMatching(/^temp_tracking\/tracking-user\//));
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/track-studio-faces"),
    expect.objectContaining({ start: 0, end: 60, anchors: { solo: { x: 34, y: 47 } } }), expect.any(Object));
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("rejects malformed coordinates before any upload", async () => {
  for (const anchors of ["{broken", "null", { solo: { x: 101, y: 50 } }, { other: { x: 50, y: 50 } }]) {
    await send(anchors).expect(400);
  }
  expect(mockSave).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
});

test("worker failure still cleans up the temporary source", async () => {
  axios.post.mockRejectedValue({ response: { status: 422 } });
  await send({ solo: { x: 34, y: 47 } }).expect(422);
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("forwards explicit source-shot mode without requiring separate cameras", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, sceneCuts: [49.5] } });
  await send({ solo: { x: 34, y: 47 } }).field("mode", "source_shots").expect(200);
  expect(axios.post).toHaveBeenCalledWith(expect.any(String),
    expect.objectContaining({ mode: "source_shots" }), expect.any(Object));
});

test("rejects unknown modes and source-shot reassignment of two panel identities", async () => {
  await send({ solo: { x: 34, y: 47 } }).field("mode", "invented").expect(400);
  await send({ top: { x: 34, y: 47 }, bottom: { x: 89, y: 17 } })
    .field("mode", "source_shots").expect(400);
  expect(mockSave).not.toHaveBeenCalled();
});
