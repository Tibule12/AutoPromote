import { createRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import MotionAssetLayer from "../components/landing/MotionAssetLayer";

describe("authored motion asset adapter", () => {
  let pause, load, previousLottie;
  beforeEach(() => {
    pause = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    load = jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    previousLottie = window.lottie;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    window.lottie = previousLottie;
    document
      .querySelectorAll('script[src*="motion-adapter-test"]')
      .forEach(script => script.remove());
  });

  test("unconfigured authoring slots mount no media or player requests", () => {
    const view = render(
      <MotionAssetLayer
        enabled
        asset={{ format: "lottie", src: null, runtimeSrc: null, start: 0, end: 3 }}
      />
    );
    expect(view.container).toBeEmptyDOMElement();
    expect(document.querySelector('script[src*="motion-adapter-test"]')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  test("video loads at its cue, seeks both directions, pauses and releases sources on unmount", () => {
    const ref = createRef();
    const view = render(
      <MotionAssetLayer
        ref={ref}
        enabled
        asset={{
          id: "clip-extraction",
          format: "video",
          sources: [{ src: "/landing/motion/clip.webm", type: "video/webm" }],
          start: 16,
          end: 22,
        }}
      />
    );
    const video = view.container.querySelector("video");
    expect(video).toHaveAttribute("preload", "none");
    expect(load).not.toHaveBeenCalled();
    Object.defineProperty(video, "duration", { configurable: true, value: 2 });
    act(() => {
      ref.current.setActive(true);
      ref.current.seek(19);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBeCloseTo(0.98);
    act(() => ref.current.seek(17.5));
    expect(video.currentTime).toBeCloseTo(0.49);
    act(() => ref.current.setActive(false));
    expect(pause).toHaveBeenCalled();
    view.unmount();
    expect(video.querySelector("source")).not.toHaveAttribute("src");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("Lottie uses the supplied local player, seeks frames and destroys its instance", async () => {
    const ref = createRef();
    const instance = {
      totalFrames: 60,
      goToAndStop: jest.fn(),
      addEventListener: jest.fn(),
      destroy: jest.fn(),
    };
    window.lottie = { loadAnimation: jest.fn(() => instance) };
    const view = render(
      <MotionAssetLayer
        ref={ref}
        enabled
        asset={{
          id: "brand-reveal",
          format: "lottie",
          src: "/landing/motion/logo.json",
          runtimeSrc: "/landing/motion-adapter-test-player.js",
          start: 0,
          end: 3,
        }}
      />
    );
    act(() =>
      document.querySelector('script[src*="motion-adapter-test"]').dispatchEvent(new Event("load"))
    );
    await waitFor(() => expect(window.lottie.loadAnimation).toHaveBeenCalled());
    expect(window.lottie.loadAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ autoplay: false, loop: false, renderer: "svg" })
    );
    act(() => ref.current.seek(1.5));
    expect(instance.goToAndStop).toHaveBeenLastCalledWith(29.5, true);
    view.unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  test("a failed or invalid export leaves the live composition available", () => {
    const view = render(
      <MotionAssetLayer
        enabled
        asset={{
          id: "clip-extraction",
          format: "video",
          sources: [{ src: "/missing-motion.webm", type: "video/webm" }],
          start: 0,
          end: 3,
        }}
      />
    );
    fireEvent.error(view.container.querySelector("video"));
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
    const invalid = render(
      <MotionAssetLayer
        enabled
        asset={{ format: "image", src: "https://invalid.example/asset.png", start: 0, end: 3 }}
      />
    );
    expect(invalid.container).toBeEmptyDOMElement();
  });
});
