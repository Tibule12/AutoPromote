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
