import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { act } from "react";
import MemeticComposerPanel from "../MemeticComposerPanel";

// Some tests perform async media/fetch operations; increase timeout to avoid flaky failures
jest.setTimeout(20000);

jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue("fake-token") } },
}));

describe("MemeticComposerPanel", () => {
  beforeEach(() => {
    // Mock HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      fillText: jest.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
    }));

    // default fetch returns an empty successful response so unexpected calls won't hang
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    // provide a controllable mock Audio implementation so we can trigger events
    const handlers = {};
    const audioMock = {
      play: jest.fn().mockResolvedValue(),
      pause: jest.fn(),
      addEventListener: (ev, fn) => {
        handlers[ev] = fn;
      },
      removeEventListener: ev => {
        delete handlers[ev];
      },
      trigger: (ev, ...args) => {
        if (handlers[ev]) handlers[ev](...args);
      },
      duration: 0,
      currentTime: 0,
      src: "",
    };
    global.Audio = jest.fn(() => audioMock);
    // keep the prototype-based play/pause as fallback in some tests
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue();
    HTMLMediaElement.prototype.pause = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete HTMLMediaElement.prototype.play;
    delete HTMLMediaElement.prototype.pause;
    // remove global.fetch to avoid leaking behavior between test files
    try {
      delete global.fetch;
    } catch (e) {
      global.fetch = undefined;
    }
  });

  test("loads sounds, generates a plan and seeds it", async () => {
    // GET /api/sounds
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          sounds: [{ id: "s1", title: "Sound 1", url: "https://example.com/s1.mp3" }],
        }),
      })
    );

    // POST /api/clips/memetic/plan
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          variants: [
            {
              id: "v1",
              title: "Variant 1",
              reason: "Test Reason",
              viralScore: 42,
              previewUrl: "https://example.com/v1.mp3",
              thumbnailUrl: "https://example.com/v1.jpg",
            },
          ],
        }),
      })
    );

    // POST /api/clips/memetic/seed
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => ({ experimentId: "e1" }) })
    );

    render(<MemeticComposerPanel onClose={() => {}} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Sound select validation removed as UI focus shifted to Mutation Params
    // expect(screen.getByLabelText(/Base Sound/i)).toBeInTheDocument();

    // Click generate
    const genButton = screen.getByText(/Generate Mutations/i);
    fireEvent.click(genButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    // Variant should show up
    expect(await screen.findByText(/Variant 1/)).toBeInTheDocument();

    // Click Preview (should call audio play and show thumbnail)
    const previewBtn = screen.getByText(/Preview/i);
    fireEvent.click(previewBtn);

    // Assert thumbnail is rendered
    expect(await screen.findByAltText(/Variant 1|Variant thumbnail/i)).toBeInTheDocument();

    // audio instance should have been created
    expect(global.Audio).toHaveBeenCalled();
    const audioInstance = global.Audio.mock.results[0].value;

    // trigger loadedmetadata and timeupdate events to update scrubber
    audioInstance.duration = 3.2;
    await act(async () => audioInstance.trigger("loadedmetadata"));
    audioInstance.currentTime = 1.1;
    await act(async () => audioInstance.trigger("timeupdate"));

    const scrubber = await screen.findByLabelText(/Audio scrubber/i);
    // input value may be stringified - allow approximate check
    expect(Number(scrubber.value)).toBeCloseTo(1.1, 1);

    // change scrubber (seek)
    fireEvent.change(scrubber, { target: { value: "2.0" } });
    expect(audioInstance.currentTime).toBe(2);

    // Open modal by clicking thumbnail
    const thumb = await screen.findByAltText(/Variant 1|Variant thumbnail/i);
    fireEvent.click(thumb);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Variant 1/)).toBeInTheDocument();

    // Play inside modal and assert waveform updates
    const playBtn = screen.getByText(/Play/i);
    fireEvent.click(playBtn);

    // trigger loadedmetadata and timeupdate events to update waveform
    audioInstance.duration = 4.2;
    await act(async () => audioInstance.trigger("loadedmetadata"));
    audioInstance.currentTime = 1.4;
    await act(async () => audioInstance.trigger("timeupdate"));

    // waveform fill should reflect progress
    const fill = within(dialog).getByTestId("modal-waveform-fill");
    expect(fill).not.toBeNull();
    expect(parseFloat(fill.style.width)).toBeGreaterThan(0);

    // keyboard: Space should pause playback
    const keyCatcher = within(dialog).getByTestId("preview-key-catcher");
    fireEvent.keyDown(keyCatcher, { key: " ", code: "Space" });
    expect(audioInstance.pause).toHaveBeenCalled();

    // keyboard: ArrowRight should seek forward (up to duration)
    const before = audioInstance.currentTime;
    fireEvent.keyDown(keyCatcher, { key: "ArrowRight", code: "ArrowRight" });
    expect(audioInstance.currentTime).toBeGreaterThan(before);

    // simulate a seek in modal (set currentTime and trigger update)
    await act(async () => {
      audioInstance.currentTime = 3.0;
      audioInstance.trigger("timeupdate");
    });

    // resume playback (Space toggles resume) so inline peaks will show again
    fireEvent.keyDown(keyCatcher, { key: " ", code: "Space" });

    // close modal
    fireEvent.click(screen.getByText(/Close Preview/i));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Click Seed Plan
    const seedBtn = screen.getByText(/Seed to Cohort/i);
    fireEvent.click(seedBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });
});
