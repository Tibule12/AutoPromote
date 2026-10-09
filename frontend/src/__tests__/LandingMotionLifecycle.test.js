import { act, render, screen, waitFor } from "@testing-library/react";
import MotionEditingScene from "../components/landing/MotionEditingScene";
import { createEditingScene } from "../components/landing/createEditingScene";

jest.mock("../components/landing/createEditingScene", () => ({ createEditingScene: jest.fn() }));

describe("public motion scene lifecycle", () => {
  let originalMedia, originalObserver, mediaChanged, intersections, scene;
  beforeEach(() => {
    originalMedia = window.matchMedia;
    originalObserver = window.IntersectionObserver;
    intersections = [];
    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: (_, callback) => {
        mediaChanged = callback;
      },
      removeEventListener: jest.fn(),
    }));
    window.IntersectionObserver = jest.fn(callback => {
      intersections.push(callback);
      return { observe: jest.fn(), disconnect: jest.fn() };
    });
    scene = {
      setActive: jest.fn(),
      setPaused: jest.fn(),
      setProgress: jest.fn(),
      replay: jest.fn(),
      dispose: jest.fn(),
    };
    createEditingScene.mockReset().mockResolvedValue(scene);
  });
  afterEach(() => {
    window.matchMedia = originalMedia;
    window.IntersectionObserver = originalObserver;
  });

  test("does not load the WebGL scene until visible, pauses offscreen, and disposes on unmount", async () => {
    const view = render(<MotionEditingScene />);
    expect(createEditingScene).not.toHaveBeenCalled();
    act(() => intersections[0]([{ isIntersecting: true }]));
    await waitFor(() => expect(createEditingScene).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(view.container.firstChild).toHaveAttribute("data-renderer", "three-webgl")
    );
    act(() => intersections[0]([{ isIntersecting: false }]));
    expect(scene.setActive).toHaveBeenLastCalledWith(false);
    view.unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  test("reduced motion skips WebGL and keeps an informative editing preview", () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const view = render(<MotionEditingScene />);
    act(() => intersections[0]([{ isIntersecting: true }]));
    expect(createEditingScene).not.toHaveBeenCalled();
    expect(view.container.firstChild).toHaveAttribute("data-renderer", "static");
    expect(screen.getByText(/Motion is paused/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Illustrative editing timeline/)).toBeInTheDocument();
  });

  test("a graphics initialization failure falls back without losing the product story", async () => {
    createEditingScene.mockRejectedValue(new Error("webgl-unavailable"));
    const view = render(<MotionEditingScene />);
    act(() => intersections[0]([{ isIntersecting: true }]));
    await waitFor(() =>
      expect(view.container.firstChild).toHaveAttribute("data-renderer", "static")
    );
    expect(screen.getByLabelText(/AutoPromote editing illustration/)).toBeInTheDocument();
  });

  test("a live preference change disposes the renderer and removes the canvas", async () => {
    const view = render(<MotionEditingScene />);
    act(() => intersections[0]([{ isIntersecting: true }]));
    await waitFor(() =>
      expect(view.container.firstChild).toHaveAttribute("data-renderer", "three-webgl")
    );
    window.matchMedia.mock.results.forEach(result => {
      result.value.matches = true;
    });
    act(() => mediaChanged());
    await waitFor(() =>
      expect(view.container.firstChild).toHaveAttribute("data-renderer", "static")
    );
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("canvas")).toBeNull();
  });
});
