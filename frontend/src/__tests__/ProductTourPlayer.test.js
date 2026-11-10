import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductTourPlayer from "../components/landing/ProductTourPlayer";

describe("recorded product tour", () => {
  afterEach(() => jest.restoreAllMocks());

  test("loads on user intent and honors the latest chapter selected before metadata", () => {
    render(<ProductTourPlayer />);
    const video = screen.getByLabelText("AutoPromote product tour");
    expect(video).not.toHaveAttribute("src");
    expect(video).toHaveAttribute("preload", "none");
    fireEvent.click(screen.getByRole("button", { name: /03 Schedule/ }));
    fireEvent.click(screen.getByRole("button", { name: /04 Analytics/ }));
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(27);
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("button", { name: /02 Studio/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("unloads decoded media and disconnects observation on unmount", () => {
    const original = global.IntersectionObserver;
    const disconnect = jest.fn();
    let observerCallback;
    global.IntersectionObserver = jest.fn(callback => {
      observerCallback = callback;
      return { observe: jest.fn(), disconnect };
    });
    try {
      const { unmount } = render(<ProductTourPlayer />);
      const video = screen.getByLabelText("AutoPromote product tour");
      const pause = jest.spyOn(video, "pause");
      const load = jest.spyOn(video, "load");
      pause.mockClear();
      load.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Play product tour/ }));
      observerCallback([{ isIntersecting: false }]);
      expect(pause).toHaveBeenCalledTimes(1);
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(pause).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenCalledTimes(2);
      expect(video).not.toHaveAttribute("src");
    } finally { global.IntersectionObserver = original; }
  });

  test("recovers from missing media and reports rejected playback without hiding controls", async () => {
    render(<ProductTourPlayer />);
    const video = screen.getByLabelText("AutoPromote product tour");
    fireEvent.click(screen.getByRole("button", { name: /Play product tour/ }));
    fireEvent.error(video);
    expect(screen.getByRole("status")).toHaveTextContent("could not load");
    jest.spyOn(video, "play").mockRejectedValueOnce(new Error("Playback blocked"));
    fireEvent.click(screen.getByRole("button", { name: /Retry product tour/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Playback paused"));
    expect(video).toHaveAttribute("controls");
    expect(screen.getByRole("link", { name: /Open film/ })).toHaveAttribute("href", "/landing/product-tour-l40s.mp4");
  });

  test("a user pause or a newer chapter request does not report an interrupted play as a failure", async () => {
    render(<ProductTourPlayer />);
    const video = screen.getByLabelText("AutoPromote product tour");
    jest.spyOn(video, "play").mockRejectedValueOnce(Object.assign(new Error("User paused"), { name: "AbortError" }));
    fireEvent.click(screen.getByRole("button", { name: /Play product tour/ }));
    await waitFor(() => expect(video).toHaveAttribute("controls"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
