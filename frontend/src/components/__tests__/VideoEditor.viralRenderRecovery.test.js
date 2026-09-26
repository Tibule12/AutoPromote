import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideoEditor from "../VideoEditor";
import { loadViralRenderAttempt, saveViralRenderAttempt } from "../../utils/viralRenderRecovery";
import { getMediaAuthToken } from "../../utils/mediaAuth";

let mockCurrentUser;

jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: mockCurrentUser }),
}));

jest.mock("../../utils/mediaAuth", () => ({
  getMediaAuthToken: jest.fn(() => Promise.resolve("test-token")),
}));

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({
    editing: { features: {} },
    credits: { remaining: 100 },
  }),
}));

jest.mock("../../hooks/useCinematicEffects", () => () => ({
  fx: {},
  showPanel: false,
  setShowPanel: jest.fn(),
  applyPreset: jest.fn(),
  updateFx: jest.fn(),
  resetFx: jest.fn(),
  mediaStyle: {},
  hasEffects: false,
  attachVideo: jest.fn(),
}));

jest.mock("../ViralClipStudio", () => props => (
  <div data-testid="mock-viral-studio">
    {props.renderRecoveryPanel}
    {props.renderedOutput?.url ? (
      <span data-testid="recovered-studio-output">{props.renderedOutput.url}</span>
    ) : null}
  </div>
));

jest.mock("../MultiCamCombiner", () => () => null);
jest.mock("../ThumbnailGenerator", () => () => null);
jest.mock("../SmartPromoSummaryPanel", () => () => null);

const source = {
  name: "source.mp4",
  url: "https://media.example.com/source.mp4",
  type: "video/mp4",
  isRemote: true,
  openStudio: true,
  clips: [{ id: "full-video", start: 0, end: 12, duration: 12 }],
};

const creditResponse = {
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ balance: 100, costs: {} }),
};

describe("VideoEditor viral render recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCurrentUser = { uid: "creator-a", getIdToken: jest.fn().mockResolvedValue("test-token") };
    getMediaAuthToken.mockResolvedValue("test-token");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
    delete global.fetch;
  });

  test("restores a completed render from the owned request lookup after remount", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    expect(loadViralRenderAttempt("creator-a")?.requestId).toBe("render-request-a123");
    expect(await getMediaAuthToken()).toBe("test-token");
    const onSave = jest.fn();
    const lookup = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        jobId: "job-a",
        result: { url: "https://media.example.com/completed.mp4" },
      }),
    });
    global.fetch = jest.fn((url, options) => {
      if (String(url).includes("/viral-render-attempt/")) return lookup(url, options);
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <VideoEditor file={{ ...source, openStudio: false }} onSave={onSave} onCancel={jest.fn()} />
    );

    await waitFor(() => expect(lookup).toHaveBeenCalled());
    expect(await screen.findByLabelText("Recovered viral clip")).toHaveAttribute(
      "src",
      "https://media.example.com/completed.mp4"
    );
    expect(lookup).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/media\/viral-render-attempt\/render-request-a123$/),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      })
    );
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/process"))
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Use in Publisher" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://media.example.com/completed.mp4",
        captionReviewCopy: false,
        isRemote: true,
      })
    );
  });

  test("restores a processing job without starting another paid render", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    global.fetch = jest.fn(url => {
      if (String(url).includes("/viral-render-attempt/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "processing", jobId: "job-a", progress: 47 }),
        });
      }
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    const view = render(
      <VideoEditor
        file={{ ...source, openStudio: false }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(await screen.findByText(/Previous render is processing · 47%/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use in Publisher" })).not.toBeInTheDocument();
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/process"))
    ).toBe(false);
    view.unmount();
  });

  test("keeps a recovered caption review copy out of the publisher", async () => {
    saveViralRenderAttempt("creator-a", {
      requestId: "render-request-a123",
      captionReviewCopy: true,
    });
    global.fetch = jest.fn(url => {
      if (String(url).includes("/viral-render-attempt/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            jobId: "job-a",
            outputUrl: "https://media.example.com/caption-review.mp4",
          }),
        });
      }
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <VideoEditor
        file={{ ...source, openStudio: false }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(await screen.findByLabelText("Recovered viral clip")).toHaveAttribute(
      "src",
      "https://media.example.com/caption-review.mp4"
    );
    expect(screen.queryByRole("button", { name: "Use in Publisher" })).not.toBeInTheDocument();
  });

  test("does not request another user's saved render attempt", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    mockCurrentUser = { uid: "creator-b", getIdToken: jest.fn().mockResolvedValue("test-token") };
    global.fetch = jest.fn(url => {
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <VideoEditor
        file={{ ...source, openStudio: false }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("Video Editing Workspace")).toBeInTheDocument());
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).includes("/viral-render-attempt/"))
    ).toBe(false);
    expect(screen.queryByTestId("viral-render-recovery")).not.toBeInTheDocument();
  });

  test("shows recovery actions when Studio opens directly", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    global.fetch = jest.fn(url => {
      if (String(url).includes("/viral-render-attempt/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            jobId: "job-a",
            result: { url: "https://media.example.com/completed.mp4" },
          }),
        });
      }
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    const onSave = jest.fn();
    render(<VideoEditor file={source} onSave={onSave} onCancel={jest.fn()} />);

    expect(await screen.findByTestId("mock-viral-studio")).toBeInTheDocument();
    expect(await screen.findByTestId("viral-render-recovery")).toBeInTheDocument();
    expect(screen.getByTestId("recovered-studio-output")).toHaveTextContent(
      "https://media.example.com/completed.mp4"
    );
    fireEvent.click(screen.getByRole("button", { name: "Use in Publisher" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://media.example.com/completed.mp4" })
    );
  });

  test("shows a failed render without offering a stale publisher action", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    global.fetch = jest.fn(url => {
      if (String(url).includes("/viral-render-attempt/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "failed", error: "Worker unavailable" }),
        });
      }
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(await screen.findByText("Render failed: Worker unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use in Publisher" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  test("retries a temporarily unavailable status lookup with the same request ID", async () => {
    saveViralRenderAttempt("creator-a", { requestId: "render-request-a123" });
    let lookupCount = 0;
    global.fetch = jest.fn(url => {
      if (String(url).includes("/viral-render-attempt/")) {
        lookupCount += 1;
        if (lookupCount === 1) return Promise.reject(new Error("Network unavailable"));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "processing", progress: 26 }),
        });
      }
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry status check" }));
    expect(await screen.findByText(/Previous render is processing · 26%/)).toBeInTheDocument();
    expect(loadViralRenderAttempt("creator-a")?.requestId).toBe("render-request-a123");
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/process"))
    ).toBe(false);
  });
});
