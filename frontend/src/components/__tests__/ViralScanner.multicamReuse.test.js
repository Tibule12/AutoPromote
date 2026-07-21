import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ViralScanner from "../ViralScanner";

jest.mock("../../utils/clipWorkflowAnalytics", () => ({
  trackClipWorkflowEvent: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../../utils/sourceUpload", () => ({
  uploadTemporaryVideoSource: jest.fn(),
}));

jest.mock("../../firebaseClient", () => ({
  auth: {
    currentUser: {
      uid: "owner-1",
      getIdToken: jest.fn(() => Promise.resolve("token")),
    },
  },
}));

describe("ViralScanner saved Cam Combiner source", () => {
  const originalFetch = global.fetch;
  const originalPlay = window.HTMLMediaElement.prototype.play;
  const originalPause = window.HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: jest.fn(() => Promise.resolve()),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });

    global.fetch = jest.fn((url, options = {}) => {
      const requestUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();
      if (requestUrl.includes("/api/analytics/clip-scanner-cache") && method === "GET") {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (requestUrl.includes("/api/analytics/clip-scanner-cache") && method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) });
      }
      if (requestUrl.includes("/api/monetization/credits/balance")) {
        return Promise.resolve({ ok: true, text: async () => JSON.stringify({ balance: 100 }) });
      }
      if (requestUrl.includes("/api/media/scan-preflight")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            allowed: true,
            balance: 100,
            requiredCredits: 8,
            tier: "pro",
            planName: "Studio",
          }),
        });
      }
      if (requestUrl.includes("/api/media/worker-health")) {
        return Promise.resolve({ ok: true, status: 200, text: async () => "ok" });
      }
      if (requestUrl.includes("/api/media/analyze")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            remainingCredits: 92,
            scenes: [{ id: "clip-1", start: 5, end: 16, viralScore: 84 }],
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.HTMLMediaElement.prototype.play = originalPlay;
    window.HTMLMediaElement.prototype.pause = originalPause;
    jest.clearAllMocks();
  });

  it("sends the render job contract and skips the source upload endpoint", async () => {
    render(
      <ViralScanner
        file={{
          name: "cam-combiner-render-1.mp4",
          type: "video/mp4",
          url: "https://storage.example.com/master.mp4",
          isRemote: true,
          renderJobId: "render-1",
        }}
        onSelectClip={jest.fn()}
        onClose={jest.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    await screen.findByTestId("scanner-guidance-card");

    const analyzeCall = global.fetch.mock.calls.find(([url]) =>
      String(url).includes("/api/media/analyze")
    );
    expect(JSON.parse(analyzeCall[1].body)).toEqual(
      expect.objectContaining({
        renderJobId: "render-1",
        fileUrl: "https://storage.example.com/master.mp4",
        sourceStoragePath: null,
      })
    );
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).includes("/api/media/upload-source"))
    ).toBe(false);
  });
});
