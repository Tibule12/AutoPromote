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
  getAuth: jest.fn(() => ({
    currentUser: {
      uid: "test-user",
      getIdToken: jest.fn(() => Promise.resolve("token")),
    },
  })),
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
    const hookToggle = screen.getByLabelText(/Add Viral Hook/i);
    if (!hookToggle.checked) {
      fireEvent.click(hookToggle);
    }
  }

  test("does not auto-enable hook controls on initial render", () => {
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

    expect(screen.getByLabelText(/Add Viral Hook/i)).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Select Hook Segment/i })).not.toBeInTheDocument();
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

  test("adds extracted background audio controls after uploading a source video", async () => {
    uploadSourceFileViaBackend.mockResolvedValue({
      url: "https://example.com/source-upload.mp4",
    });
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobId: "audio-job-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          progress: 100,
          audio_url: "https://example.com/audio.mp3",
          result: {
            audioUrl: "https://example.com/audio.mp3",
            audioDuration: 14.5,
            format: "mp3",
          },
        }),
      });

    const onStatusChange = jest.fn();
    const { container } = render(
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

    const audioUploadInput = screen.getByTestId("background-audio-upload-input");

    await act(async () => {
      fireEvent.change(audioUploadInput, {
        target: {
          files: [new File(["video"], "sound-source.mp4", { type: "video/mp4" })],
        },
      });
    });

    await waitFor(() => {
      expect(uploadSourceFileViaBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: "video",
          fileName: "sound-source.mp4",
        })
      );
    });

    await waitFor(
      () => {
        expect(screen.getByText("Background audio added to the timeline.")).toBeInTheDocument();
        expect(screen.getByText("sound-source.mp4")).toBeInTheDocument();
        expect(screen.getByText(/Trim Start:/i)).toBeInTheDocument();
        expect(screen.getByText(/Volume:/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Pause Track/i })).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    fireEvent.click(screen.getByRole("button", { name: /Pause Track/i }));
    expect(screen.getByRole("button", { name: /Play Track/i })).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenCalledWith(
      "Background audio extracted and added to the timeline."
    );
  });

  test("exports the selected background audio mode with the render options", async () => {
    uploadSourceFileViaBackend.mockResolvedValue({
      url: "https://example.com/source-upload.mp4",
    });
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobId: "audio-job-2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          stage: "completed",
          progress: 100,
          audio_url: "https://example.com/audio.mp3",
          result: {
            audioUrl: "https://example.com/audio.mp3",
            audioDuration: 14.5,
            format: "mp3",
          },
        }),
      });

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

    await act(async () => {
      fireEvent.change(screen.getByTestId("background-audio-upload-input"), {
        target: {
          files: [new File(["video"], "sound-source.mp4", { type: "video/mp4" })],
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByText("Background audio added to the timeline.")).toBeInTheDocument();
        expect(screen.getByLabelText("Background audio mode")).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    fireEvent.change(screen.getByLabelText("Background audio mode"), {
      target: { value: "replace" },
    });

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
        backgroundAudio: expect.objectContaining({
          mode: "replace",
          ducking_strength: 0.45,
        }),
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

    expect(onSave).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({
        timelineSegments: expect.arrayContaining([
          expect.objectContaining({
            id: "main",
            url: "https://example.com/mock.mp4",
          }),
        ]),
      })
    );
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
    expect(guidanceCard.textContent).toContain("Viral Score: 100");
    expect(guidanceCard.textContent).toContain("Why this clip");
    expect(guidanceCard.textContent).toContain(
      "Strong speech or a spoken setup lands in the opening seconds"
    );
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

    expect(screen.getByLabelText(/Add Viral Hook/i)).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Export TikTok/i }));
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
});
