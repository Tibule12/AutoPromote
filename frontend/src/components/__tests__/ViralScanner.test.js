import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ViralScanner from "../ViralScanner";
import { uploadTemporaryVideoSource } from "../../utils/sourceUpload";

jest.mock("../../utils/clipWorkflowAnalytics", () => ({
  trackClipWorkflowEvent: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../../utils/sourceUpload", () => ({
  uploadTemporaryVideoSource: jest.fn(),
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

describe("ViralScanner guided clip selection", () => {
  const originalFetch = global.fetch;
  const originalPlay = window.HTMLMediaElement.prototype.play;
  const originalPause = window.HTMLMediaElement.prototype.pause;

  function mockScannerFetch({
    scenes = [],
    cache = null,
    balance = 120,
    remainingCredits = 100,
    analyzeResponse,
    accessAllowed = true,
    accessCode = null,
    accessMessage = "Find Viral Clips is ready.",
    topUpsAllowed = true,
    workerHealthResponse = null,
  }) {
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

      if (requestUrl.includes("/api/media/scan-preflight")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            allowed: accessAllowed,
            code: accessCode,
            message: accessMessage,
            balance,
            requiredCredits: 8,
            tier: accessAllowed ? "pro" : "free",
            planName: accessAllowed ? "Studio" : "Starter",
            topUpsAllowed,
          }),
        });
      }

      if (requestUrl.includes("/api/media/worker-health")) {
        if (workerHealthResponse) return Promise.resolve(workerHealthResponse);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => JSON.stringify({ ok: true }),
        });
      }

      if (requestUrl.includes("/api/media/analyze")) {
        if (typeof analyzeResponse === "function") {
          return analyzeResponse();
        }

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
    uploadTemporaryVideoSource.mockImplementation(async ({ file, onProgress }) => {
      onProgress?.(file.size, file.size);
      return {
        ok: true,
        storagePath: "temp_scans/scanner-user/secure-local-source.mp4",
        size: file.size,
      };
    });
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

  test("shows an honest pending state without fabricated moments while analysis runs", async () => {
    let resolveAnalyze;
    const analyzePromise = new Promise(resolve => {
      resolveAnalyze = resolve;
    });

    mockScannerFetch({
      analyzeResponse: () => analyzePromise,
      scenes: [
        {
          start_time: 6.2,
          end_time: 20.4,
          reason: "Lead vocal rises and audience energy follows immediately",
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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    const processingVisuals = await screen.findByTestId("scanner-processing-visuals");
    expect(processingVisuals.textContent).toContain("AI analysis is running");
    expect(screen.getByText(/No moments have been claimed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lead Vocal Peak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/84\/100/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveAnalyze({
        ok: true,
        status: 200,
        json: async () => ({
          remainingCredits: 100,
          scenes: [
            {
              start_time: 6.2,
              end_time: 20.4,
              reason: "Lead vocal rises and audience energy follows immediately",
            },
          ],
        }),
      });
      await analyzePromise;
    });

    await screen.findByTestId("scanner-guidance-card");
  });

  test("highlights the best clip with score, reasons, and tags after scanning", async () => {
    mockScannerFetch({
      scenes: [
        {
          start_time: 6.2,
          end_time: 20.4,
          scoreConfidence: 84,
          scoreConfidenceLabel: "Strong evidence",
          learningApplied: true,
          learnedAdjustment: 3.4,
          learningProfileSamples: 9,
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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    const guidanceCard = await screen.findByTestId("scanner-guidance-card");
    expect(guidanceCard.textContent).toContain("BEST CLIP");
    expect(guidanceCard.textContent).toContain("Viral Score: 100");
    expect(guidanceCard.textContent).toContain("Strong evidence");
    expect(guidanceCard.textContent).toContain("Evidence confidence");
    expect(guidanceCard.textContent).toContain("84%");
    expect(guidanceCard.textContent).toContain("Personalized +3.4 from 9 measured outcomes");
    expect(guidanceCard.textContent).toContain("Why this clip");
    expect(guidanceCard.textContent).toContain("Starts with a spoken beat or voice-led setup");
    expect(guidanceCard.textContent).toContain("🔥 High Energy");
    expect(guidanceCard.textContent).toContain("😳 Emotional");
    expect(guidanceCard.textContent).toContain("🎓 Educational");
  });

  test("blocks a local upload when the current plan does not include Find Viral Clips", async () => {
    const file = new File(["video-bytes"], "local-source.mp4", { type: "video/mp4" });
    const onUpgrade = jest.fn();
    mockScannerFetch({
      accessAllowed: false,
      accessCode: "VIRAL_SCAN_PLAN_REQUIRED",
      accessMessage:
        "Find Viral Clips requires an active Creator, Studio, Agency, or Founding Tester plan.",
      balance: 15,
    });

    render(
      <ViralScanner
        file={file}
        onSelectClip={jest.fn()}
        onClose={jest.fn()}
        onUpgrade={onUpgrade}
      />
    );

    const block = await screen.findByTestId("scanner-access-block");
    expect(block.textContent).toContain("Your plan does not include Find Viral Clips");
    expect(block.textContent).toContain("Your video has not been uploaded");
    fireEvent.click(screen.getByRole("button", { name: /View Plans/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(uploadTemporaryVideoSource).not.toHaveBeenCalled();
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/analyze"))
    ).toBe(false);
  });

  test("shows the exact credit shortfall before uploading a local file", async () => {
    const file = new File(["video-bytes"], "local-source.mp4", { type: "video/mp4" });
    mockScannerFetch({
      accessAllowed: false,
      accessCode: "VIRAL_SCAN_CREDITS_REQUIRED",
      accessMessage: "Find Viral Clips needs 8 credits, but only 3 are available.",
      balance: 3,
    });

    render(<ViralScanner file={file} onSelectClip={jest.fn()} onClose={jest.fn()} />);

    const block = await screen.findByTestId("scanner-access-block");
    expect(block.textContent).toContain("This scan needs 8 credits. You have 3.");
    expect(screen.getByRole("button", { name: /Buy Credits/i })).toBeInTheDocument();
    expect(uploadTemporaryVideoSource).not.toHaveBeenCalled();
  });

  test("explains a worker wake timeout without uploading or charging the scan", async () => {
    const file = new File(["video-bytes"], "local-source.mp4", { type: "video/mp4" });
    mockScannerFetch({
      workerHealthResponse: {
        ok: false,
        status: 503,
        json: async () => ({
          code: "MEDIA_WORKER_WAKE_TIMEOUT",
          message:
            "The AI worker is taking longer than expected to wake up. Please try the scan again. Your video was not uploaded and no credits were used.",
        }),
      },
    });

    render(<ViralScanner file={file} onSelectClip={jest.fn()} onClose={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    expect(await screen.findByText(/taking longer than expected to wake up/i)).toBeInTheDocument();
    expect(uploadTemporaryVideoSource).not.toHaveBeenCalled();
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/analyze"))
    ).toBe(false);
  });

  test("uploads local files to authenticated temporary storage and charges 8 credits", async () => {
    const file = new File(["video-bytes"], "local-source.mp4", { type: "video/mp4" });

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
        return Promise.resolve({ ok: true, text: async () => JSON.stringify({ balance: 120 }) });
      }
      if (requestUrl.includes("/api/media/scan-preflight")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            allowed: true,
            balance: 120,
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
            remainingCredits: 112,
            scenes: [{ id: "local-1", start: 2, end: 14, viralScore: 82 }],
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    render(<ViralScanner file={file} onSelectClip={jest.fn()} onClose={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );
    const startButton = screen.getByRole("button", { name: /Start AI Scan/i });
    expect(startButton.textContent).toContain("8");

    await act(async () => {
      fireEvent.click(startButton);
    });

    await screen.findByTestId("scanner-guidance-card");

    expect(uploadTemporaryVideoSource).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        purpose: "viral_scan",
        onProgress: expect.any(Function),
      })
    );
    const analyzeCall = global.fetch.mock.calls.find(([url]) =>
      String(url).includes("/api/media/analyze")
    );
    expect(JSON.parse(analyzeCall[1].body)).toEqual(
      expect.objectContaining({
        fileUrl: "",
        sourceStoragePath: "temp_scans/scanner-user/secure-local-source.mp4",
        forceFresh: false,
        scanNonce: "",
      })
    );
    expect(JSON.parse(analyzeCall[1].body)).not.toHaveProperty("localPath");
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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start AI Scan/i })).not.toBeDisabled()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start AI Scan/i }));
    });

    const guidanceCard = await screen.findByTestId("scanner-guidance-card");
    expect(guidanceCard.textContent).toContain("This clip can perform better");

    await act(async () => {
      fireEvent.click(within(guidanceCard).getByRole("button", { name: /Use with fixes/i }));
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

  test("unmutes a detected moment when the user asks to preview it with sound", async () => {
    mockScannerFetch({
      scenes: [
        {
          id: "audible-clip",
          start_time: 4,
          end_time: 16,
          reason: "Strong spoken hook with rising audio energy",
          score: 88,
        },
      ],
    });

    const { container } = render(
      <ViralScanner
        file="https://example.com/source.mp4"
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

    const soundButton = await screen.findByRole("button", {
      name: /Play selected clip with sound/i,
    });
    const video = container.querySelector(".scanner-video-frame video");
    expect(video.muted).toBe(true);

    await act(async () => {
      fireEvent.click(soundButton);
    });

    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
  });
});
