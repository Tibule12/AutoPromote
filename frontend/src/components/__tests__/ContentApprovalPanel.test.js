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
      });
    }
    if (url.endsWith("/api/admin/approval/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          stats: { pending: 1, approved: 0, rejected: 0, approvedToday: 0, rejectedToday: 0 },
        }),
      });
    }
    // Media fetch
    if (url === "https://example.com/video.mp4") {
      const blob = new Blob(["dummy"], { type: "video/mp4" });
      return Promise.resolve({ ok: true, blob: async () => blob });
    }
    return Promise.resolve({ ok: false });
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

test("opens viewer modal and shows a video element when View Content clicked", async () => {
  render(<ContentApprovalPanel />);

  // Wait for content to load
  await screen.findByText(/Pending Approval/i);
  expect(screen.getByText("Video")).toBeInTheDocument();

  const viewBtn = screen.getByText(/View Content →/i);
  fireEvent.click(viewBtn);

  // Wait for modal and media element to appear
  await screen.findByRole("dialog");
  const video = await screen.findByTestId("viewer-video");
  expect(video).toBeInTheDocument();
});
