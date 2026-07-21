import { isExpectedMediaPlaybackInterruption, playMediaSafely } from "../mediaPlayback";

describe("media playback helpers", () => {
  test("treats interrupted browser play requests as expected", () => {
    expect(
      isExpectedMediaPlaybackInterruption(
        new DOMException("The play() request was interrupted by a call to pause().", "AbortError")
      )
    ).toBe(true);
  });

  test("absorbs expected play interruptions", async () => {
    const onUnexpectedError = jest.fn();
    const media = {
      play: jest.fn(() => Promise.reject(new DOMException("interrupted", "AbortError"))),
    };

    await expect(playMediaSafely(media, { onUnexpectedError })).resolves.toBe(false);
    expect(onUnexpectedError).not.toHaveBeenCalled();
  });

  test("reports unexpected playback failures", async () => {
    const error = new Error("decoder failed");
    const onUnexpectedError = jest.fn();
    const media = { play: jest.fn(() => Promise.reject(error)) };

    await expect(playMediaSafely(media, { onUnexpectedError })).resolves.toBe(false);
    expect(onUnexpectedError).toHaveBeenCalledWith(error);
  });
});
