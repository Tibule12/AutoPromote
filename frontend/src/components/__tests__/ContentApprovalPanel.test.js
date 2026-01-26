import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ContentApprovalPanel from "../ContentApprovalPanel";

// Mock firebase auth
jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue("fake-token") } },
}));

// Mock fetch responses
beforeEach(() => {
  global.fetch = jest.fn((url, opts) => {
    if (url.endsWith("/api/admin/approval/pending")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          content: [
            {
              id: "c1",
              title: "Video",
              url: "https://example.com/video.mp4",
              type: "video",
              user: { name: "Tester", email: "t@test.com" },
            },
          ],
        }),
        headers: { get: () => "application/json" },
      });
    }
    if (url.endsWith("/api/admin/approval/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          stats: { pending: 1, approved: 0, rejected: 0, approvedToday: 0, rejectedToday: 0 },
        }),
        headers: { get: () => "application/json" },
      });
    }
    // Media fetch
    if (url === "https://example.com/video.mp4") {
      const blob = new Blob(["dummy"], { type: "video/mp4" });
      return Promise.resolve({
        ok: true,
        blob: async () => blob,
        headers: { get: () => "video/mp4" },
      });
    }
    return Promise.resolve({ ok: false });
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

test("opens viewer modal and shows a video element when View Content clicked", async () => {
  render(<ContentApprovalPanel />);

  // Wait for content header and the item title to appear
  await screen.findByRole("heading", { name: /Pending Approval/i });
  await screen.findByText("Video");

  const viewBtn = screen.getByText(/View Content →/i);
  fireEvent.click(viewBtn);

  // Wait for modal and media element to appear
  await screen.findByRole("dialog");
  const video = await screen.findByTestId("viewer-video");
  expect(video).toBeInTheDocument();
});

test("opens viewer modal and shows an image element when View Content clicked for image", async () => {
  // Override fetch to return an image content
  global.fetch = jest.fn((url, opts = {}) => {
    if (url.endsWith("/api/admin/approval/pending")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          content: [
            {
              id: "c2",
              title: "Image",
              url: "https://example.com/image.png",
              type: "image",
              user: { name: "ImageTester", email: "i@test.com" },
            },
          ],
        }),
        headers: { get: () => "application/json" },
      });
    }
    if (url.endsWith("/api/admin/approval/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          stats: { pending: 1, approved: 0, rejected: 0, approvedToday: 0, rejectedToday: 0 },
        }),
        headers: { get: () => "application/json" },
      });
    }
    // HEAD request
    if (url === "https://example.com/image.png" && opts && opts.method === "HEAD") {
      return Promise.resolve({
        ok: true,
        headers: { get: k => (k.toLowerCase() === "content-type" ? "image/png" : null) },
      });
    }
    // GET image
    if (url === "https://example.com/image.png") {
      const blob = new Blob(["dummyimage"], { type: "image/png" });
      return Promise.resolve({
        ok: true,
        blob: async () => blob,
        headers: { get: () => "image/png" },
      });
    }
    return Promise.resolve({ ok: false });
  });

  render(<ContentApprovalPanel />);

  await screen.findByRole("heading", { name: /Pending Approval/i });
  await screen.findByText("Image");

  const viewBtn = screen.getByText(/View Content →/i);
  fireEvent.click(viewBtn);

  await screen.findByRole("dialog");
  const img = await screen.findByTestId("viewer-image");
  expect(img).toBeInTheDocument();
});
