import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ViralScanner from "../ViralScanner";

jest.mock("../../utils/clipWorkflowAnalytics", () => ({
  trackClipWorkflowEvent: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../../firebaseClient", () => ({
  storage: {},
  auth: {
    currentUser: {
      uid: "scanner-user",
      getIdToken: jest.fn(() => Promise.resolve("token")),
    },
  },
}));

jest.mock("firebase/storage", () => ({
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
}));

describe("ViralScanner guided clip selection", () => {
  const originalFetch = global.fetch;
  const originalPlay = window.HTMLMediaElement.prototype.play;
  const originalPause = window.HTMLMediaElement.prototype.pause;

  function mockScannerFetch({ scenes = [], cache = null, balance = 120, remainingCredits = 100 }) {
    global.fetch = jest.fn((url, options = {}) => {
      const requestUrl = String(url);
      const method = String(options.method || "GET").toUpperCase();

      if (requestUrl.includes("/api/analytics/clip-scanner-cache") && method === "GET") {
        if (!cache) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: "missing" }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ cache }),
        });
      }

      if (requestUrl.includes("/api/analytics/clip-scanner-cache") && method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) });
      }

      if (requestUrl.includes("/api/monetization/credits/balance")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ balance }),
        });
      }

      if (requestUrl.includes("/api/media/analyze")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            remainingCredits,
            scenes,
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
  }

  beforeEach(() => {
    global.fetch = jest.fn();
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.HTMLMediaElement.prototype.play = originalPlay;
    window.HTMLMediaElement.prototype.pause = originalPause;
    jest.clearAllMocks();
  });

  test("highlights the best clip with score, reasons, and tags after scanning", async () => {
    mockScannerFetch({
      scenes: [
        {
          start_time: 6.2,
          end_time: 20.4,
          reason:
            "Speaker explains why this works with a face close-up, fast scene change, and emotional reveal",
        },
        {
          start_time: 24,
          end_time: 31,
          reason: "Static setup",
        },
      ],
    });

    render(
      <ViralScanner
        file="https://example.com/source.mp4"
        onSelectClip={jest.fn()}
        onClose={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    const guidanceCard = await screen.findByTestId("scanner-guidance-card");
    expect(guidanceCard.textContent).toContain("BEST CLIP");
    expect(guidanceCard.textContent).toContain("Viral Score: 100");
    expect(guidanceCard.textContent).toContain("Why this clip");
    expect(guidanceCard.textContent).toContain("Starts with a spoken beat or voice-led setup");
    expect(guidanceCard.textContent).toContain("🔥 High Energy");
    expect(guidanceCard.textContent).toContain("😳 Emotional");
    expect(guidanceCard.textContent).toContain("🎓 Educational");
  });

  test("passes improvement metadata when sending a weak clip to the editor", async () => {
    const onSelectClip = jest.fn();

    mockScannerFetch({
      scenes: [
        {
          start_time: 12,
          end_time: 19,
          reason: "Static setup",
        },
      ],
    });

    render(
      <ViralScanner
        file="https://example.com/source.mp4"
        onSelectClip={onSelectClip}
        onClose={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    const guidanceCard = await screen.findByTestId("scanner-guidance-card");
    expect(guidanceCard.textContent).toContain("This clip can perform better");

    await act(async () => {
      fireEvent.click(within(guidanceCard).getByRole("button", { name: /Improve Clip/i }));
    });

    await waitFor(() => {
      expect(onSelectClip).toHaveBeenCalled();
    });

    expect(onSelectClip).toHaveBeenCalledWith(
      expect.objectContaining({
        improveInEditor: true,
        guidedScore: 0,
        scanSessionId: expect.any(String),
        suggestedHookText: "WATCH WHAT HAPPENS NEXT",
        suggestedImprovements: expect.arrayContaining([
          "Cut the first 2 seconds",
          "Add hook",
          "Add captions",
        ]),
      })
    );
  });

  test("loads saved scanner results without requiring a new AI scan", async () => {
    mockScannerFetch({
      cache: {
        createdAt: Date.now() - 60_000,
        expiresAt: Date.now() + 60_000,
        resultCount: 1,
        topScore: 80,
        sourceLabel: "source.mp4",
        results: [
          {
            id: "cached-1",
            start: 8,
            end: 20,
            duration: 12,
            reason: "Speaker explains the key lesson with a clear face close-up",
            transcript: "Here is exactly why this works",
            score: 80,
          },
        ],
      },
    });

    render(
      <ViralScanner
        file="https://example.com/source.mp4"
        onSelectClip={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const guidanceCard = await screen.findByTestId("scanner-guidance-card");
    expect(guidanceCard.textContent).toContain("Viral Score: 80");
    expect(screen.getByText(/Saved scan from/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rescan/i })).toBeInTheDocument();
  });
});
