import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ViralClipStudio from "../ViralClipStudio";
import { uploadSourceFileViaBackend } from "../../utils/sourceUpload";

jest.mock("../../utils/clipWorkflowAnalytics", () => ({
  trackClipWorkflowEvent: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../../firebaseClient", () => ({
  storage: {},
}));

jest.mock("firebase/storage", () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve("https://example.com/mock.mp4")),
}));

jest.mock("firebase/auth", () => ({
  getAuth: () => ({
    currentUser: {
      uid: "test-user",
      getIdToken: jest.fn(() => Promise.resolve("token")),
    },
  }),
}));

jest.mock("html2canvas", () => jest.fn(() => Promise.resolve({ toBlob: cb => cb(new Blob()) })));

jest.mock("../../utils/sourceUpload", () => ({
  uploadSourceFileViaBackend: jest.fn(),
}));

describe("ViralClipStudio timeline sequencing", () => {
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;
  const originalPrompt = window.prompt;
  const originalCreateElement = document.createElement.bind(document);
  const originalPlay = window.HTMLMediaElement.prototype.play;
  const originalPause = window.HTMLMediaElement.prototype.pause;
  const originalLoad = window.HTMLMediaElement.prototype.load;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  let consoleErrorSpy;

  beforeEach(() => {
    uploadSourceFileViaBackend.mockImplementation(({ file, onProgress }) => {
      onProgress?.(file?.size || 1, file?.size || 1);
      return Promise.resolve({ url: "https://example.com/mock.mp4" });
    });
    window.confirm = jest.fn(() => false);
    window.alert = jest.fn();
    window.prompt = jest.fn(() => null);
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
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
    global.fetch = jest.fn();
    document.createElement = jest.fn(tagName => {
      const element = originalCreateElement(tagName);
      if (tagName === "audio" || tagName === "video") {
        Object.defineProperty(element, "play", {
          configurable: true,
          writable: true,
          value: jest.fn(() => Promise.resolve()),
        });
        Object.defineProperty(element, "pause", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
        Object.defineProperty(element, "load", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
      }
      return element;
    });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation((...args) => {
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.prompt = originalPrompt;
    document.createElement = originalCreateElement;
    window.HTMLMediaElement.prototype.play = originalPlay;
    window.HTMLMediaElement.prototype.pause = originalPause;
    window.HTMLMediaElement.prototype.load = originalLoad;
    global.fetch = originalFetch;
    consoleErrorSpy?.mockRestore();
    jest.clearAllMocks();
  });

  test("previews a signature transformation and includes it in the export contract", async () => {
    const onSave = jest.fn(() => Promise.resolve());
    const clips = [
      { id: "clip-creative", start: 0, end: 12, duration: 12, url: "https://example.com/clip.mp4" },
    ];

    render(
      <ViralClipStudio
        videoUrl="https://example.com/clip.mp4"
        clips={clips}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Reality Break/i }));

    expect(screen.getByTestId("creative-effect-live-layer")).toBeInTheDocument();
    expect(screen.getByTestId("hook-preview-frame")).toHaveClass("creative-preview-reality_break");

    fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2].creativePlan).toEqual(
      expect.objectContaining({
        version: 1,
        enabled: true,
        intensity: "bold",
        fallback: "clean",
        effects: [
          expect.objectContaining({
            preset: "reality_break",
            intensity: "bold",
            start_time: 0,
            end_time: 12,
          }),
        ],
      })
    );
  });

  test("removes a marked middle range and exports retained segments with a join style", async () => {
    const onSave = jest.fn(() => Promise.resolve());
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-cut", start: 0, end: 12, duration: 12, reason: "Creator take" }]}
        onSave={onSave}
        onCancel={() => {}}
      />
    );

    const afterVideo = screen.getByTestId("studio-after-video");
    Object.defineProperty(afterVideo, "duration", {
      configurable: true,
      value: 12,
    });
    fireEvent.loadedMetadata(afterVideo);
    fireEvent.click(screen.getByRole("button", { name: /^Cut$/i }));

    afterVideo.currentTime = 3;
    fireEvent.timeUpdate(afterVideo);
    fireEvent.click(screen.getByRole("button", { name: /Mark remove start/i }));
    afterVideo.currentTime = 5;
    fireEvent.timeUpdate(afterVideo);
    fireEvent.click(screen.getByRole("button", { name: /Mark remove end/i }));
    fireEvent.click(screen.getByRole("button", { name: /Soft Dip/i }));

    expect(screen.getByTestId("pending-cut-summary")).toHaveTextContent("2.0s");
    expect(screen.getByTestId("timeline-pending-cut-range")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remove-marked-range"));
    expect(screen.queryByTestId("pending-cut-summary")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-output-time")).toHaveTextContent("0:10.0");
    expect(screen.getByTestId("timeline-applied-cut")).toHaveAttribute(
      "title",
      "2.0 seconds removed here"
    );
    expect(
      screen.getByTestId("timeline-source-track").querySelectorAll(".compact-filmstrip-frame")
        .length
    ).toBeGreaterThan(1);

    const sourceTrack = screen.getByTestId("timeline-source-track");
    sourceTrack.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 62,
      width: 200,
      height: 62,
    });
    fireEvent.click(sourceTrack, { clientX: 190 });
    expect(afterVideo.currentTime).toBeGreaterThan(5);
    fireEvent.click(screen.getByTestId("timeline-hook-block"));
    expect(afterVideo.currentTime).toBeCloseTo(0.8, 1);

    fireEvent.click(screen.getByRole("checkbox", { name: /Add Hook/i }));
    fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const timelineSegments = onSave.mock.calls[0][2].timelineSegments;
    expect(timelineSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start_time: 0,
          end_time: 3,
          transition_out: "soft_dip",
        }),
        expect.objectContaining({
          start_time: 5,
          end_time: 12,
          transition_in: "soft_dip",
        }),
      ])
    );
  }, 15000);

  function setupVideoCreateElementMock() {
    const createdVideos = [];
    document.createElement = jest.fn(tagName => {
      const element = originalCreateElement(tagName);
      if (tagName === "audio" || tagName === "video") {
        Object.defineProperty(element, "play", {
          configurable: true,
          writable: true,
          value: jest.fn(() => Promise.resolve()),
        });
        Object.defineProperty(element, "pause", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
        Object.defineProperty(element, "load", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
      }
      if (tagName === "video") {
        Object.defineProperty(element, "duration", {
          configurable: true,
          writable: true,
          value: 12,
        });
        createdVideos.push(element);
      }
      return element;
    });
    return createdVideos;
  }

  function setupHookAnalysisEnvironment() {
    let lastFrameTime = 0;

    document.createElement = jest.fn(tagName => {
      const element = originalCreateElement(tagName);

      if (tagName === "audio" || tagName === "video") {
        Object.defineProperty(element, "play", {
          configurable: true,
          writable: true,
          value: jest.fn(() => Promise.resolve()),
        });
        Object.defineProperty(element, "pause", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
        Object.defineProperty(element, "load", {
          configurable: true,
          writable: true,
          value: jest.fn(),
        });
      }

      if (tagName === "video") {
        let currentTimeValue = 0;
        Object.defineProperty(element, "duration", {
          configurable: true,
          writable: true,
          value: 8,
        });
        Object.defineProperty(element, "currentTime", {
          configurable: true,
          get: () => currentTimeValue,
          set: value => {
            currentTimeValue = Number(value) || 0;
            element.dispatchEvent(new Event("seeked"));
          },
        });
      }

      if (tagName === "canvas") {
        Object.defineProperty(element, "getContext", {
          configurable: true,
          writable: true,
          value: jest.fn(() => ({
            drawImage: jest.fn(video => {
              lastFrameTime = Number(video?.currentTime || 0);
            }),
            getImageData: jest.fn((x, y, width, height) => {
              const data = new Uint8ClampedArray(width * height * 4);
              const hotZone = lastFrameTime >= 2.0 && lastFrameTime <= 4.4;
              const amplitude = hotZone ? 150 : 28;
              const brightness = hotZone ? 168 : 88;
              const timePhase = hotZone ? lastFrameTime * 11 : lastFrameTime * 2;

              for (let row = 0; row < height; row += 1) {
                for (let column = 0; column < width; column += 1) {
                  const pixelIndex = row * width + column;
                  const dataIndex = pixelIndex * 4;
                  const wave = Math.sin(
                    (column / Math.max(1, width)) * Math.PI * (hotZone ? 10 : 2) + timePhase
                  );
                  const diagonal = ((column + row) % (hotZone ? 7 : 23)) * (hotZone ? 4 : 1.2);
                  const luminance = Math.max(
                    0,
                    Math.min(255, Math.round(brightness + wave * amplitude + diagonal))
                  );

                  data[dataIndex] = luminance;
                  data[dataIndex + 1] = luminance;
                  data[dataIndex + 2] = luminance;
                  data[dataIndex + 3] = 255;
                }
              }

              return { data };
            }),
          })),
        });
      }

      return element;
    });
  }

  function getTimelineOrder(container) {
    return Array.from(container.querySelectorAll(".timeline-scroll-area .timeline-clip-thumb")).map(
      node => node.textContent.replace(/\s+/g, " ").trim()
    );
  }

  function getOverlayTextNode() {
    return screen.queryByText(/Text: Double Click to/i);
  }

  function ensureHookControlsOpen() {
    const hookToggle = screen.getByLabelText(/^Add Hook$/i);
    if (!hookToggle.checked) {
      fireEvent.click(hookToggle);
    }
  }

  test("enables the hook controls on initial render", () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText(/^Add Hook$/i)).toBeChecked();
    expect(screen.getByRole("button", { name: /Select Hook Segment/i })).toBeInTheDocument();

    const inspector = screen.getByTestId("clip-studio-inspector");
    fireEvent.click(within(inspector).getByRole("button", { name: "Zoom Focus" }));
    expect(within(inspector).getByText(/fast focal push with extra contrast/i)).toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: "Freeze frame" }));
    expect(within(inspector).getByText(/confident freeze, headline hit/i)).toBeInTheDocument();
  });

  test("shows a live visual timeline that seeks the same After preview", () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          {
            id: "clip-1",
            start: 0,
            end: 10,
            duration: 10,
            reason: "This proof changes everything",
          },
        ]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const timeline = screen.getByTestId("live-edit-timeline");
    const sourceTrack = screen.getByTestId("timeline-source-track");
    const afterVideo = screen.getByTestId("studio-after-video");
    Object.defineProperty(afterVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    sourceTrack.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 44,
      width: 200,
      height: 44,
    });

    expect(
      within(timeline).getByText(/same media, timings and audio decisions/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("timeline-hook-block")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-original-audio")).toHaveTextContent("Original voice");
    expect(sourceTrack.querySelectorAll(".compact-filmstrip-frame").length).toBeGreaterThan(1);

    fireEvent.click(sourceTrack, { clientX: 100 });
    expect(afterVideo.currentTime).toBeCloseTo(5, 1);
    expect(screen.getByText(/Timeline and After are on the same frame/i)).toBeInTheDocument();
  });

  test("dragging the selected hook range does not toggle selection mode", () => {
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const selectionButton = screen.getByRole("button", { name: /Select Hook Segment/i });
    expect(selectionButton).toBeInTheDocument();

    const selectionRange = container.querySelector(".hook-segment-selection");
    expect(selectionRange).not.toBeNull();

    fireEvent.mouseDown(selectionRange, { clientX: 120 });

    expect(screen.getByRole("button", { name: /Select Hook Segment/i })).toBeInTheDocument();
  });

  test("allows choosing a hook point from the timeline and setting it as the hook", async () => {
    const onSave = jest.fn();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Choose Hook/i }));
    });

    const hookTrack = container.querySelector(".hook-segment-track");
    expect(hookTrack).not.toBeNull();
    hookTrack.getBoundingClientRect = () => ({
      left: 0,
      width: 200,
      top: 0,
      bottom: 56,
      right: 200,
      height: 56,
    });

    await act(async () => {
      fireEvent.mouseDown(hookTrack, { clientX: 104 });
    });

    expect(previewVideo.currentTime).toBeCloseTo(5.2, 1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Set as Hook/i }));
    });

    await waitFor(() => {
      expect(container.querySelector(".hook-segment-readout")?.textContent).toContain("0:5.20");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saveOptions = onSave.mock.calls[0][2];
    expect(saveOptions.hookSourceStartTime).toBeCloseTo(5.2, 1);
    expect(saveOptions.hookSourceEndTime).toBeCloseTo(8.2, 1);
  });

  test("setting a hook point freezes the chosen opening moment", async () => {
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Choose Hook/i }));
    });

    const hookTrack = container.querySelector(".hook-segment-track");
    expect(hookTrack).not.toBeNull();
    hookTrack.getBoundingClientRect = () => ({
      left: 0,
      width: 200,
      top: 0,
      bottom: 56,
      right: 200,
      height: 56,
    });

    await act(async () => {
      fireEvent.mouseDown(hookTrack, { clientX: 104 });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Set as Hook/i }));
    });

    expect(screen.getByLabelText(/Freeze opening frame/i)).toBeChecked();
    expect(screen.getByRole("button", { name: /Freeze \+ Text/i })).toHaveClass("active");
  });

  test("allows clearing hook text completely", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const hookTextArea = screen.getByPlaceholderText(/Type a curiosity hook/i);
    expect(hookTextArea.value).not.toBe("");

    await act(async () => {
      fireEvent.change(hookTextArea, { target: { value: "" } });
    });

    await waitFor(() => {
      expect(hookTextArea.value).toBe("");
    });
  });

  test("captures preview focus targeting and exports cover frame metadata", async () => {
    const onSave = jest.fn();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    const previewFrame = screen.getByTestId("hook-preview-frame");
    previewFrame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 240,
      right: 200,
      bottom: 240,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pick Focus/i }));
    });

    expect(screen.getByTestId("hook-focus-target")).toBeInTheDocument();

    fireEvent.click(previewFrame, { clientX: 150, clientY: 60 });

    expect(screen.getByText(/Focus target 75% x 25%/i)).toBeInTheDocument();
    expect(screen.queryByTestId("hook-focus-target")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Choose Hook/i }));
    });

    const hookTrack = container.querySelector(".hook-segment-track");
    expect(hookTrack).not.toBeNull();
    hookTrack.getBoundingClientRect = () => ({
      left: 0,
      width: 200,
      top: 0,
      bottom: 56,
      right: 200,
      height: 56,
    });

    await act(async () => {
      fireEvent.mouseDown(hookTrack, { clientX: 104 });
    });

    previewVideo.currentTime = 5.2;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Set as Hook/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saveOptions = onSave.mock.calls[0][2];
    expect(saveOptions.hookFocusPoint?.x).toBeCloseTo(75, 0);
    expect(saveOptions.hookFocusPoint?.y).toBeCloseTo(25, 0);
    expect(saveOptions.coverFrame).toEqual(
      expect.objectContaining({
        sourceTime: expect.closeTo(5.2, 1),
        freezeFrame: true,
        template: "freeze_text",
        focusPoint: expect.objectContaining({ x: 75, y: 25 }),
      })
    );
    expect(saveOptions.thumbnailFrame).toEqual(
      expect.objectContaining({
        purpose: "thumbnail",
        sourceTime: expect.closeTo(5.2, 1),
      })
    );
    expect(saveOptions.hook).toEqual(
      expect.objectContaining({
        focusPoint: expect.objectContaining({ x: 75, y: 25 }),
      })
    );
  });

  test("uses face-aware hook banner placement and freeze-text offset in the preview", async () => {
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    const previewFrame = screen.getByTestId("hook-preview-frame");
    previewFrame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 240,
      right: 200,
      bottom: 240,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pick Focus/i }));
    });

    fireEvent.click(previewFrame, { clientX: 110, clientY: 60 });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Choose Hook/i }));
    });

    const hookTrack = container.querySelector(".hook-segment-track");
    expect(hookTrack).not.toBeNull();
    hookTrack.getBoundingClientRect = () => ({
      left: 0,
      width: 200,
      top: 0,
      bottom: 56,
      right: 200,
      height: 56,
    });

    await act(async () => {
      fireEvent.mouseDown(hookTrack, { clientX: 104 });
    });

    previewVideo.currentTime = 5.2;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Set as Hook/i }));
    });

    const banner = await screen.findByTestId("hook-preview-banner");
    expect(banner.className).toContain("hook-preview-banner-position-left");
    expect(banner.className).toContain("hook-preview-banner-subject-face");
    expect(parseFloat(banner.style.top)).toBeLessThanOrEqual(9);
  });

  async function appendTimelineClip(input, createdVideos, fileName, fileContents) {
    const initialCount = createdVideos.length;
    fireEvent.change(input, {
      target: { files: [new File([fileContents], fileName, { type: "video/mp4" })] },
    });
    await waitFor(() => expect(createdVideos.length).toBeGreaterThan(initialCount));
    await act(async () => {
      createdVideos[createdVideos.length - 1].onloadedmetadata();
    });
  }

  test("allows appended clips to be reordered in the timeline", async () => {
    const createdVideos = setupVideoCreateElementMock();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const addClipInput = screen.getByTestId("timeline-add-clip-input");

    await appendTimelineClip(addClipInput, createdVideos, "a.mp4", "a");
    await appendTimelineClip(addClipInput, createdVideos, "b.mp4", "b");

    await waitFor(() => {
      expect(screen.getByText("a.mp4")).toBeInTheDocument();
      expect(screen.getByText("b.mp4")).toBeInTheDocument();
    });

    const initialOrder = getTimelineOrder(container).join(" | ");
    expect(initialOrder).toContain("1");
    expect(initialOrder.indexOf("a.mp4")).toBeLessThan(initialOrder.indexOf("b.mp4"));

    const betaThumb = screen.getByText("b.mp4").closest(".timeline-clip-thumb");
    const moveEarlierButton = within(betaThumb).getByTitle("Move clip earlier");
    fireEvent.click(moveEarlierButton);

    await waitFor(() => {
      const reordered = getTimelineOrder(container).join(" | ");
      expect(reordered.indexOf("b.mp4")).toBeLessThan(reordered.indexOf("a.mp4"));
    });
  });

  test("keeps the same timeline clip active after reordering", async () => {
    const createdVideos = setupVideoCreateElementMock();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const addClipInput = screen.getByTestId("timeline-add-clip-input");
    await appendTimelineClip(addClipInput, createdVideos, "a.mp4", "a");
    await appendTimelineClip(addClipInput, createdVideos, "b.mp4", "b");

    const activeBefore = screen.getByText("b.mp4").closest(".timeline-clip-thumb");
    fireEvent.click(activeBefore);
    expect(activeBefore.className).toContain("active");

    const moveEarlierButton = within(activeBefore).getByTitle("Move clip earlier");
    fireEvent.click(moveEarlierButton);

    await waitFor(() => {
      const activeThumb = container.querySelector(
        ".timeline-scroll-area .timeline-clip-thumb.active"
      );
      expect(activeThumb).not.toBeNull();
      expect(activeThumb.textContent).toContain("b.mp4");
    });
  });

  test("allows detected viral moments to be reordered", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          { id: "clip-1", start: 0, end: 10, duration: 10, reason: "First hook" },
          { id: "clip-2", start: 10, end: 18, duration: 8, reason: "Second hook" },
        ]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const firstCard = screen.getByTestId("detected-clip-clip-1");
    const secondCard = screen.getByTestId("detected-clip-clip-2");
    expect(firstCard.textContent).toContain("First hook");
    expect(secondCard.textContent).toContain("Second hook");

    fireEvent.click(screen.getByTestId("detected-move-left-clip-2"));

    await waitFor(() => {
      const cards = screen.getAllByTestId(/detected-clip-/);
      expect(cards[0].textContent).toContain("Second hook");
      expect(cards[1].textContent).toContain("First hook");
    });
  });

  test("supports undo and redo for overlay edits", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Add Text/i));
    await waitFor(() => {
      expect(getOverlayTextNode()).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId("studio-undo-button"));
    await waitFor(() => {
      expect(getOverlayTextNode()).toBeNull();
    });

    fireEvent.click(screen.getByTestId("studio-redo-button"));
    await waitFor(() => {
      expect(getOverlayTextNode()).not.toBeNull();
    });
  });

  test("preserves uploaded B-roll through duplicate, delete, undo, and redo", async () => {
    const createdVideos = setupVideoCreateElementMock();
    const onSave = jest.fn(() => Promise.resolve());
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 12, duration: 12, reason: "Hook" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /B-roll/i }));
    const uploadedFile = new File(["cutaway"], "proof-cutaway.mp4", {
      type: "video/mp4",
    });
    const initialCreatedVideoCount = createdVideos.length;
    fireEvent.change(screen.getByTestId("broll-video-input"), {
      target: { files: [uploadedFile] },
    });

    await waitFor(() => expect(createdVideos.length).toBeGreaterThan(initialCreatedVideoCount));
    await act(async () => {
      createdVideos[createdVideos.length - 1].onloadedmetadata();
    });
    await waitFor(() => expect(screen.getAllByText("proof-cutaway.mp4").length).toBeGreaterThan(0));

    const inspector = screen.getByTestId("clip-studio-inspector");
    fireEvent.click(within(inspector).getByRole("button", { name: "Picture-in-picture" }));
    fireEvent.click(screen.getByRole("button", { name: "After" }));

    const previewShell = screen.getByTestId("hook-preview-frame").parentElement;
    await waitFor(() =>
      expect(previewShell.querySelectorAll(".draggable-overlay")).toHaveLength(1)
    );
    fireEvent.click(within(previewShell).getByTitle("Duplicate overlay"));
    await waitFor(() =>
      expect(previewShell.querySelectorAll(".draggable-overlay")).toHaveLength(2)
    );

    fireEvent.click(previewShell.querySelector(".overlay-delete-btn"));
    await waitFor(() => {
      expect(previewShell.querySelectorAll(".draggable-overlay")).toHaveLength(1);
      expect(previewShell.querySelector(".draggable-overlay.active")).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId("studio-undo-button"));
    await waitFor(() => {
      expect(previewShell.querySelectorAll(".draggable-overlay")).toHaveLength(2);
      expect(screen.getAllByText("proof-cutaway.mp4").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId("studio-redo-button"));
    await waitFor(() => {
      expect(previewShell.querySelectorAll(".draggable-overlay")).toHaveLength(1);
      expect(previewShell.querySelector(".draggable-overlay.active")).not.toBeNull();
      expect(screen.getAllByText("proof-cutaway.mp4").length).toBeGreaterThan(0);
    });

    uploadSourceFileViaBackend.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });
    await waitFor(() => expect(uploadSourceFileViaBackend).toHaveBeenCalled());
    expect(
      uploadSourceFileViaBackend.mock.calls.some(([options]) => options.file === uploadedFile)
    ).toBe(true);
  }, 15000);

  test("undoes and redoes Make It Hit as one reversible edit", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn(() => Promise.resolve({ silences: [] })),
    });
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 12, duration: 12, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const afterVideo = screen.getByTestId("studio-after-video");
    expect(screen.queryByTestId("live-caption-preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("make-it-hit-button"));
    await waitFor(() => {
      expect(screen.getByTestId("live-caption-preview")).toBeInTheDocument();
      expect(afterVideo.playbackRate).toBeCloseTo(1.15);
    });

    fireEvent.click(screen.getByTestId("studio-undo-button"));
    await waitFor(() => {
      expect(screen.queryByTestId("live-caption-preview")).not.toBeInTheDocument();
      expect(afterVideo.playbackRate).toBeCloseTo(1);
    });

    fireEvent.click(screen.getByTestId("studio-redo-button"));
    await waitFor(() => {
      expect(screen.getByTestId("live-caption-preview")).toBeInTheDocument();
      expect(afterVideo.playbackRate).toBeCloseTo(1.15);
    });
  });

  test("keeps only original-audio controls in the studio", async () => {
    const onStatusChange = jest.fn();
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={onStatusChange}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    expect(screen.queryByTestId("background-audio-upload-input")).toBeNull();
    expect(screen.queryByText(/Upload donor video/i)).toBeNull();
    expect(screen.queryByText(/Add Background Music/i)).toBeNull();
    expect(screen.getAllByLabelText(/Mute Original Audio/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Original audio control/i)).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  test("exports mute-original-audio without background audio options", async () => {
    const onSave = jest.fn();
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getAllByLabelText(/Mute Original Audio/i)[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({
        muteAudio: true,
        addMusic: false,
        musicFile: null,
        backgroundAudio: null,
      })
    );
  });

  test("materializes blob-backed main timeline clips before export", async () => {
    const onSave = jest.fn();
    global.fetch = jest.fn(url => {
      if (url === "blob:http://localhost:3001/source-video") {
        return Promise.resolve({
          ok: true,
          blob: async () => new Blob(["video-data"], { type: "video/mp4" }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch for ${url}`));
    });

    render(
      <ViralClipStudio
        videoUrl="blob:http://localhost:3001/source-video"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const timelineSegments = onSave.mock.calls[0][2].timelineSegments;
    expect(uploadSourceFileViaBackend).toHaveBeenCalledTimes(1);
    expect(timelineSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_clip_id: "main",
          url: "https://example.com/mock.mp4",
        }),
      ])
    );
    expect(
      timelineSegments.every(
        segment => typeof segment.url === "string" && !segment.url.startsWith("blob:")
      )
    ).toBe(true);
  });

  test("exports the selected hook once and removes the duplicate span from the main clip", async () => {
    const onSave = jest.fn();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Calm intro" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const hookRangeInputs = container.querySelectorAll(
      ".hook-segment-scrubbers input[type='range']"
    );
    expect(hookRangeInputs).toHaveLength(2);

    fireEvent.change(hookRangeInputs[0], { target: { value: "1.2" } });
    fireEvent.change(hookRangeInputs[1], { target: { value: "3.4" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saveOptions = onSave.mock.calls[0][2];
    expect(saveOptions.hookStartTime).toBe(0);
    expect(saveOptions.hookEndTime).toBeCloseTo(2.2, 1);
    expect(saveOptions.hook).toEqual(
      expect.objectContaining({
        startTime: 0,
        duration: expect.closeTo(2.2, 1),
        sourceStartTime: expect.closeTo(1.2, 1),
        sourceEndTime: expect.closeTo(3.4, 1),
      })
    );
    expect(saveOptions.timelineSegments[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^hook-intro-/),
        url: "https://example.com/source.mp4",
        start_time: expect.closeTo(1.2, 1),
        end_time: expect.closeTo(3.4, 1),
        duration: expect.closeTo(2.2, 1),
      })
    );
    expect(saveOptions.timelineSegments[1]).toEqual(
      expect.objectContaining({
        id: "main-before-hook",
        start_time: 0,
        end_time: expect.closeTo(1.2, 1),
        duration: expect.closeTo(1.2, 1),
      })
    );
    expect(saveOptions.timelineSegments[2]).toEqual(
      expect.objectContaining({
        id: "main-after-hook",
        start_time: expect.closeTo(3.4, 1),
        end_time: 10,
        duration: expect.closeTo(6.6, 1),
      })
    );
  });

  test("suggests a hook segment from video analysis and applies it", async () => {
    setupHookAnalysisEnvironment();

    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 8, duration: 8, reason: "Steady explanation" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const hookTextArea = screen.getByPlaceholderText(/Type a curiosity hook/i);
    expect(hookTextArea.value).toBe("WATCH WHAT HAPPENS NEXT");
    fireEvent.change(hookTextArea, { target: { value: "THIS CHANGES FAST" } });
    const freezeToggle = screen.getByLabelText(/Freeze opening frame/i);
    fireEvent.click(freezeToggle);
    expect(freezeToggle).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Suggest Hook/i }));
    });

    await waitFor(() => {
      expect(container.querySelector(".hook-analysis-status")).not.toBeNull();
    });

    expect(container.querySelector(".hook-analysis-status")?.textContent).toMatch(
      /confidence|falling back|detected/i
    );
    expect(screen.getByRole("button", { name: /Suggest Hook/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply suggested segment/i }));
    });

    expect(screen.getByLabelText(/Freeze opening frame/i)).toBeChecked();
    expect(hookTextArea.value).not.toBe("THIS CHANGES FAST");
    expect(container.querySelector(".hook-segment-readout")?.textContent).not.toContain(
      "0:00.80 to 0:03.80"
    );

    const firstSuggestedCopy = hookTextArea.value;
    const inspector = screen.getByTestId("clip-studio-inspector");
    await act(async () => {
      fireEvent.click(within(inspector).getByRole("button", { name: /Try another/i }));
    });
    await waitFor(() => {
      expect(within(inspector).getByRole("button", { name: /Try another/i })).not.toBeDisabled();
    });
    const suggestionCard = within(inspector).getByText("AI hook suggestion").closest("div");
    expect(suggestionCard.querySelector("strong").textContent).not.toBe(firstSuggestedCopy);
  });

  test("selected hook segment plays as the opening during normal playback", async () => {
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const hookRangeInputs = container.querySelectorAll(
      ".hook-segment-scrubbers input[type='range']"
    );
    fireEvent.change(hookRangeInputs[0], { target: { value: "1.2" } });
    fireEvent.change(hookRangeInputs[1], { target: { value: "3.4" } });

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    await act(async () => {
      previewVideo.dispatchEvent(new Event("play"));
    });

    expect(previewVideo.currentTime).toBeCloseTo(1.2, 1);

    await act(async () => {
      previewVideo.currentTime = 3.41;
      previewVideo.dispatchEvent(new Event("timeupdate"));
    });

    expect(previewVideo.currentTime).toBeCloseTo(0, 1);

    await act(async () => {
      previewVideo.currentTime = 1.21;
      previewVideo.dispatchEvent(new Event("timeupdate"));
    });

    expect(previewVideo.currentTime).toBeCloseTo(3.4, 1);
    expect(previewVideo.play).toHaveBeenCalled();
  });

  test("preview hook once plays the selected range first then jumps back to clip start", async () => {
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook moment" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    ensureHookControlsOpen();

    const hookRangeInputs = container.querySelectorAll(
      ".hook-segment-scrubbers input[type='range']"
    );
    expect(hookRangeInputs).toHaveLength(2);

    fireEvent.change(hookRangeInputs[0], { target: { value: "1.2" } });
    fireEvent.change(hookRangeInputs[1], { target: { value: "3.4" } });

    const previewVideo = container.querySelector(".studio-video");
    expect(previewVideo).not.toBeNull();

    Object.defineProperty(previewVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(previewVideo, "duration", {
      configurable: true,
      writable: true,
      value: 10,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Preview hook once/i }));
    });

    expect(previewVideo.currentTime).toBeCloseTo(1.2, 1);

    await act(async () => {
      previewVideo.currentTime = 3.41;
      previewVideo.dispatchEvent(new Event("timeupdate"));
    });

    expect(previewVideo.currentTime).toBeCloseTo(0, 1);
    expect(previewVideo.play).toHaveBeenCalled();
  });

  test("scores clips, explains why they work, and highlights the best pick", () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          {
            id: "clip-best",
            start: 6.2,
            end: 20.4,
            duration: 14.2,
            reason:
              "Speaker explains why this works with a face close-up, fast scene change, and emotional reveal",
          },
          {
            id: "clip-low",
            start: 24,
            end: 31,
            duration: 7,
            reason: "Static setup",
          },
        ]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const guidanceCard = screen.getByTestId("selected-clip-guidance");
    expect(guidanceCard.textContent).toContain("BEST CLIP");
    expect(guidanceCard.textContent).toContain("Hook Score:");
    const scoreMatch = guidanceCard.textContent.match(/Hook Score:\s*(\d+)/);
    expect(scoreMatch).not.toBeNull();
    expect(Number(scoreMatch[1])).toBeGreaterThanOrEqual(70);
    expect(guidanceCard.textContent).toContain("Why this clip");
    expect(guidanceCard.textContent).toContain(
      "Strong speech or a spoken setup lands in the opening seconds"
    );
    expect(guidanceCard.textContent).toContain("Family:");
    expect(guidanceCard.textContent).toContain("Why this can travel");
    expect(guidanceCard.textContent).toContain("Alternate recuts");
    expect(guidanceCard.textContent).toContain("Curiosity Cut");
    expect(screen.getByText("Multiple angles from one source")).toBeInTheDocument();
    expect(screen.getByText("Clusters, not duplicates")).toBeInTheDocument();
    expect(screen.getByText("Stop Scroll")).toBeInTheDocument();
    expect(guidanceCard.textContent).toContain("🔥 High Energy");
    expect(guidanceCard.textContent).toContain("😳 Emotional");
    expect(guidanceCard.textContent).toContain("🎓 Educational");
  });

  test("improves a weak clip and exports it to a chosen short-form destination", async () => {
    const onSave = jest.fn();

    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          {
            id: "clip-low",
            start: 12,
            end: 19,
            duration: 7,
            reason: "Static setup",
          },
        ]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const guidanceCard = screen.getByTestId("selected-clip-guidance");
    expect(guidanceCard.textContent).toContain("This clip can perform better");

    await act(async () => {
      fireEvent.click(within(guidanceCard).getByRole("button", { name: /Improve Clip/i }));
    });

    expect(screen.getByLabelText(/^Add Hook$/i)).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "TikTok" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({
        autoCaptions: true,
        exportDestination: "tiktok",
      })
    );
  });

  test("opens with synchronized before and after comparison", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 20, duration: 20, reason: "Podcast hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("before-preview-frame")).toBeInTheDocument();
    const afterVideo = screen.getByTestId("studio-after-video");
    expect(afterVideo).toBeInTheDocument();
    expect(afterVideo).not.toHaveAttribute("controls");
    expect(
      screen.getByRole("button", { name: /Pause comparison|Play comparison/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Untouched source preview").muted).toBe(true);

    Object.defineProperty(afterVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 20,
    });
    fireEvent.ended(afterVideo);
    await waitFor(() => expect(afterVideo.currentTime).toBeLessThan(2));

    fireEvent.click(screen.getByRole("button", { name: "After" }));
    expect(afterVideo).toHaveAttribute("controls");
  });

  test("runs a podcast cutaway with original, overlay, and mixed audio modes", async () => {
    const createdVideos = setupVideoCreateElementMock();
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 30, duration: 30, reason: "Podcast hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /B-roll/i }));

    const inspector = screen.getByTestId("clip-studio-inspector");
    const balancedPacingButton = within(inspector).getByRole("button", { name: "Balanced" });
    expect(balancedPacingButton).toHaveClass("is-active");
    expect(balancedPacingButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(inspector).getByRole("button", { name: "Frequent" }));
    expect(within(inspector).getByText(/5 suggested beats across/i)).toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: /Plan whole clip/i }));
    expect(screen.getByText(/5 B-roll beats planned across/i)).toBeInTheDocument();

    const initialCreatedVideoCount = createdVideos.length;
    fireEvent.change(screen.getByTestId("broll-video-input"), {
      target: {
        files: [new File(["cutaway"], "podcast-proof.mp4", { type: "video/mp4" })],
      },
    });

    await waitFor(() => expect(createdVideos.length).toBeGreaterThan(initialCreatedVideoCount));
    await act(async () => {
      createdVideos[createdVideos.length - 1].onloadedmetadata();
    });

    expect((await screen.findAllByText("podcast-proof.mp4")).length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByTestId(/timeline-broll-block-/)
        .find(block => block.textContent.includes("podcast-proof.mp4"))
    ).toBeInTheDocument();
    const durationInput = within(inspector)
      .getByText("Duration")
      .closest("label")
      .querySelector("input");
    expect(Number(durationInput.value)).toBeLessThanOrEqual(12);
    const startInput = within(inspector).getByText("Start").closest("label").querySelector("input");
    fireEvent.change(startInput, { target: { value: "4.0" } });
    fireEvent.blur(startInput);
    fireEvent.change(durationInput, { target: { value: "3.0" } });
    fireEvent.blur(durationInput);

    const studioAfterVideo = screen.getByTestId("studio-after-video");
    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    expect(studioAfterVideo).toHaveStyle({ width: "50%" });
    expect(
      screen.getByTestId("hook-preview-frame").querySelector(".broll-side-by-side")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Picture-in-picture" }));
    expect(studioAfterVideo).toHaveStyle({ width: "100%" });
    const previewShell = screen.getByTestId("hook-preview-frame").parentElement;
    expect(previewShell.querySelector(".draggable-overlay.active")).not.toBeInTheDocument();
    expect(previewShell.querySelector(".overlay-controls")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "After" }));
    expect(previewShell.querySelector(".draggable-overlay.active")).toBeInTheDocument();
    expect(previewShell.querySelector(".overlay-controls")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "W+" }));
    fireEvent.click(screen.getByRole("button", { name: "H+" }));
    const resizedOverlay = previewShell.querySelector(".draggable-overlay.active");
    const overlayLeft = Number.parseFloat(resizedOverlay.style.left);
    const overlayTop = Number.parseFloat(resizedOverlay.style.top);
    const overlayWidth = Number.parseFloat(resizedOverlay.style.width);
    const overlayHeight = Number.parseFloat(resizedOverlay.style.height);
    expect(overlayLeft - overlayWidth / 2).toBeGreaterThanOrEqual(0);
    expect(overlayLeft + overlayWidth / 2).toBeLessThanOrEqual(100);
    expect(overlayTop - overlayHeight / 2).toBeGreaterThanOrEqual(0);
    expect(overlayTop + overlayHeight / 2).toBeLessThanOrEqual(100);
    fireEvent.click(screen.getByRole("button", { name: "Split" }));

    const afterVideo = screen.getByTestId("studio-after-video");
    Object.defineProperty(afterVideo, "currentTime", {
      configurable: true,
      writable: true,
      value: 1,
    });

    fireEvent.click(within(inspector).getByRole("button", { name: /Apply B-roll/i }));
    await waitFor(() => expect(afterVideo.currentTime).toBe(4));
    expect(screen.getByText(/exact cutaway point/i)).toBeInTheDocument();
    const bRollPreview = screen.getByTestId(/broll-preview-/);
    expect(bRollPreview).not.toHaveAttribute("autoplay");
    expect(bRollPreview).not.toHaveAttribute("loop");

    fireEvent.click(screen.getByRole("button", { name: "Use overlay" }));
    expect(screen.getAllByTestId(/timeline-overlay-audio-/)).toHaveLength(1);
    expect(screen.getAllByTestId(/timeline-overlay-audio-/)[0]).toHaveTextContent("Overlay");
    fireEvent.timeUpdate(afterVideo);
    await waitFor(() => expect(afterVideo.muted).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Mix both" }));
    expect(screen.getAllByTestId(/timeline-overlay-audio-/)[0]).toHaveTextContent("Mix");
    fireEvent.timeUpdate(afterVideo);
    await waitFor(() => expect(afterVideo.muted).toBe(false));

    const duckOriginal = within(inspector).getByRole("checkbox", {
      name: /Duck original under overlay/i,
    });
    fireEvent.click(duckOriginal);
    const originalDucking = within(inspector).getByRole("slider", {
      name: /Original ducking strength/i,
    });
    fireEvent.change(originalDucking, { target: { value: "55" } });
    expect(originalDucking).toHaveValue("55");

    const overlayVolume = within(inspector).getByRole("slider", {
      name: /B-roll overlay volume/i,
    });
    fireEvent.change(overlayVolume, { target: { value: "80" } });
    expect(overlayVolume).toHaveValue("80");

    fireEvent.click(screen.getByRole("button", { name: "Use overlay" }));
    afterVideo.currentTime = 13;
    fireEvent.timeUpdate(afterVideo);
    await waitFor(() => expect(afterVideo.muted).toBe(false));
    expect(screen.queryByTestId(/broll-preview-/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Original audio returns automatically/i).length).toBeGreaterThan(0);
  }, 30000);

  test("recognizes uploaded B-roll that already covers the suggested beats", async () => {
    const createdVideos = setupVideoCreateElementMock();
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 20, duration: 20, reason: "Creator story" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /B-roll/i }));
    const inspector = screen.getByTestId("clip-studio-inspector");
    const initialCreatedVideoCount = createdVideos.length;
    fireEvent.change(screen.getByTestId("broll-video-input"), {
      target: {
        files: [
          new File(["fitness"], "fitness.mp4", { type: "video/mp4" }),
          new File(["cooking"], "cooking.mp4", { type: "video/mp4" }),
        ],
      },
    });

    await waitFor(() => expect(createdVideos.length).toBe(initialCreatedVideoCount + 2));
    await act(async () => {
      createdVideos.slice(-2).forEach(video => video.onloadedmetadata());
    });
    await waitFor(() => {
      expect(screen.getAllByTestId(/timeline-broll-block-/)).toHaveLength(2);
    });

    expect(within(inspector).getByText(/2 already covered/i)).toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: /Plan whole clip/i }));
    expect(screen.getAllByTestId(/timeline-broll-block-/)).toHaveLength(2);
    expect(screen.getByText(/already covered by real footage/i)).toBeInTheDocument();
  });

  test("keeps uploaded background sound enabled with speech-aware ducking", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 20, duration: 20, reason: "Podcast hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("background-sound-input"), {
      target: {
        files: [new File(["music"], "warm-bed.mp3", { type: "audio/mpeg" })],
      },
    });

    const inspector = screen.getByTestId("clip-studio-inspector");
    await waitFor(() => {
      expect(within(inspector).getByText("Music on")).toBeInTheDocument();
      expect(within(inspector).getByText("warm-bed")).toBeInTheDocument();
      expect(within(inspector).getByText("Duck under speech")).toBeInTheDocument();
    });
    expect(screen.getByTestId("timeline-music-audio")).toHaveTextContent("warm-bed");

    const duckUnderSpeech = within(inspector).getByRole("checkbox", {
      name: /Duck under speech/i,
    });
    const keepOriginalAudio = within(inspector).getByRole("checkbox", {
      name: /Keep original audio/i,
    });
    expect(duckUnderSpeech).toBeChecked();
    expect(keepOriginalAudio).toBeChecked();

    const duckingStrength = within(inspector).getByRole("slider", {
      name: /Speech ducking strength/i,
    });
    fireEvent.change(duckingStrength, { target: { value: "65" } });
    expect(duckingStrength).toHaveValue("65");

    const fadeIn = within(inspector).getByRole("slider", { name: /Music fade in/i });
    const fadeOut = within(inspector).getByRole("slider", { name: /Music fade out/i });
    fireEvent.change(fadeIn, { target: { value: "1.2" } });
    fireEvent.change(fadeOut, { target: { value: "1.5" } });
    expect(fadeIn).toHaveValue("1.2");
    expect(fadeOut).toHaveValue("1.5");

    const loopTrack = within(inspector).getByRole("checkbox", {
      name: /Loop for the full clip/i,
    });
    expect(loopTrack).toBeChecked();
    fireEvent.click(loopTrack);
    expect(loopTrack).not.toBeChecked();
    fireEvent.click(loopTrack);

    fireEvent.click(duckUnderSpeech);
    expect(duckUnderSpeech).not.toBeChecked();
    fireEvent.click(duckUnderSpeech);
    fireEvent.click(keepOriginalAudio);
    expect(keepOriginalAudio).not.toBeChecked();
    fireEvent.click(keepOriginalAudio);

    const musicPreview = screen.getByTestId("background-sound-preview");
    Object.defineProperty(musicPreview, "paused", {
      configurable: true,
      writable: true,
      value: true,
    });
    fireEvent.click(within(inspector).getByRole("button", { name: "Preview sound" }));
    expect(musicPreview.play).toHaveBeenCalled();
    expect(within(inspector).getByRole("button", { name: "Stop sound" })).toBeInTheDocument();

    musicPreview.paused = false;
    fireEvent.click(within(inspector).getByRole("button", { name: "Stop sound" }));
    expect(musicPreview.pause).toHaveBeenCalled();
    expect(within(inspector).getByRole("button", { name: "Preview sound" })).toBeInTheDocument();

    const afterVideo = screen.getByTestId("studio-after-video");
    Object.defineProperty(afterVideo, "paused", {
      configurable: true,
      writable: true,
      value: true,
    });
    musicPreview.paused = true;
    const musicPlayCallsAfterStop = musicPreview.play.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Play comparison|Pause comparison/i }));
    afterVideo.paused = false;
    fireEvent.play(afterVideo);
    expect(musicPreview.play.mock.calls.length).toBeGreaterThan(musicPlayCallsAfterStop);

    expect(() =>
      fireEvent.click(within(inspector).getByRole("button", { name: "Remove" }))
    ).not.toThrow();
    expect(
      within(inspector).getByRole("button", { name: /Add background sound/i })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("background-sound-input"), {
      target: {
        files: [new File(["music-again"], "warm-bed.mp3", { type: "audio/mpeg" })],
      },
    });

    await waitFor(() => expect(within(inspector).getByText("Music on")).toBeInTheDocument());
    expect(within(inspector).getByRole("checkbox", { name: /Duck under speech/i })).toBeChecked();
    expect(within(inspector).getByRole("checkbox", { name: /Keep original audio/i })).toBeChecked();
    expect(
      within(inspector).getByRole("checkbox", { name: /Loop for the full clip/i })
    ).toBeChecked();
    expect(within(inspector).getByRole("slider", { name: /Music fade in/i })).toHaveValue("0.5");
    expect(within(inspector).getByRole("slider", { name: /Music fade out/i })).toHaveValue("0.5");
  }, 15000);

  test("previews Creative Director captions and pacing without starting a render", async () => {
    const onSave = jest.fn();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn(() => Promise.resolve({ silences: [] })),
    });
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          {
            id: "clip-1",
            start: 0,
            end: 20,
            duration: 20,
            reason: "This one mistake is killing your growth",
          },
        ]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const afterVideo = screen.getByTestId("studio-after-video");
    await act(async () => {
      fireEvent.click(screen.getByTestId("make-it-hit-button"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("live-caption-preview")).toBeInTheDocument();
    expect(afterVideo.playbackRate).toBeCloseTo(1.15);
    expect(screen.getByTestId("timeline-output-time")).toHaveTextContent("0:17.4");
    expect(onSave).not.toHaveBeenCalled();

    const inspector = screen.getByTestId("clip-studio-inspector");
    fireEvent.click(within(inspector).getByRole("tab", { name: /Captions/i }));
    expect(within(inspector).getByRole("checkbox", { name: /Preview captions/i })).toBeChecked();

    fireEvent.change(within(inspector).getByRole("textbox", { name: /Caption copy/i }), {
      target: { value: "STOP SCROLLING — THIS CHANGES EVERYTHING" },
    });
    expect(screen.getByTestId("live-caption-preview")).toHaveTextContent(/STOP SCROLLING/i);

    fireEvent.click(within(inspector).getByRole("button", { name: "Neon Glow" }));
    expect(within(inspector).getByRole("button", { name: "Neon Glow" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("live-caption-preview")).toHaveClass("caption-style-glow");

    fireEvent.click(within(inspector).getByRole("tab", { name: /Pacing/i }));
    fireEvent.click(within(inspector).getByRole("button", { name: "1.5×" }));
    expect(afterVideo.playbackRate).toBeCloseTo(1.5);
    expect(within(inspector).getAllByText("1.50×").length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("uses one reliable render action for the selected export destination", async () => {
    const onSave = jest.fn(() => Promise.resolve());
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 20, duration: 20, reason: "Podcast hook" }]}
        onSave={onSave}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Save Locally/i })).not.toBeInTheDocument();
    const destinationPicker = screen.getByRole("radiogroup", { name: "Export destination" });
    expect(within(destinationPicker).getByRole("radio", { name: "Download" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    fireEvent.click(within(destinationPicker).getByRole("radio", { name: "TikTok" }));
    expect(within(destinationPicker).getByRole("radio", { name: "TikTok" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: /Show proof/i }));
    const inspector = screen.getByTestId("clip-studio-inspector");
    fireEvent.click(within(inspector).getByRole("tab", { name: /Pacing/i }));
    fireEvent.click(within(inspector).getByRole("button", { name: "1.5×" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Render Final Clip/i }));
    });

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        exportDestination: "tiktok",
        creativeIntent: "proof",
        previewSpeed: 1.5,
        speedSegments: [
          expect.objectContaining({
            rate: 1.5,
            pitchPreserved: true,
          }),
        ],
      })
    );
  });
});
