const request = require("supertest");
const express = require("express");

jest.mock("../../firebaseAdmin", () => {
  return {
    db: {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
    },
  };
});

const { db } = require("../../firebaseAdmin");
const mediaRoutes = require("../mediaRoutes");

let app;
beforeEach(() => {
  app = express();
  app.use(mediaRoutes);
});

test("HEAD /media/:id returns 404 when content missing", async () => {
  db.get.mockResolvedValue({ exists: false });
  const res = await request(app).head("/media/missing");
  expect(res.status).toBe(404);
});

test("GET /media/:id returns 404 when content has no url", async () => {
  db.get.mockResolvedValue({ exists: true, data: () => ({}) });
  const res = await request(app).get("/media/hasno");
  expect(res.status).toBe(404);
});

test("GET /media/tiktok-developers-site-verification.txt returns token", async () => {
  process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION = "TESTTOKEN";
  const res = await request(app).get("/media/tiktok-developers-site-verification.txt");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toMatch(/text\/plain/);
  expect(res.text).toBe("tiktok-developers-site-verification=TESTTOKEN");
});

test("HEAD /media/tiktok-developers-site-verification.txt returns 200", async () => {
  process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION = "TESTTOKEN";
  const res = await request(app).head("/media/tiktok-developers-site-verification.txt");
  expect(res.status).toBe(200);
});
