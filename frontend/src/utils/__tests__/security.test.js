import { applySafeMediaSource, sanitizeMediaUrl } from "../security";

describe("security media URLs", () => {
  test("preserves signed media URLs that already contain encoded query parameters", () => {
    const signedUrl =
      "https://storage.googleapis.com/example-bucket/clip.jpg?X-Goog-Credential=service%40example.com%2F20260602%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Signature=abc123";
    const image = document.createElement("img");

    expect(sanitizeMediaUrl(signedUrl)).toBe(signedUrl);
    expect(applySafeMediaSource(image, signedUrl)).toBe(true);
    expect(image.getAttribute("src")).toBe(signedUrl);
  });

  test("rejects unsafe javascript URLs", () => {
    const image = document.createElement("img");
    const video = document.createElement("video");

    expect(applySafeMediaSource(image, "javascript:alert(1)")).toBe(false);
    expect(image.hasAttribute("src")).toBe(false);
    expect(applySafeMediaSource(video, 'javascript:<img src=x onerror="alert(1)">')).toBe(false);
    expect(video.hasAttribute("src")).toBe(false);
  });

  test("does not write media URLs onto non-media elements", () => {
    const div = document.createElement("div");

    expect(applySafeMediaSource(div, "https://example.com/clip.mp4")).toBe(false);
    expect(div.hasAttribute("src")).toBe(false);
  });

  test("reloads playable media only when its source changes or clears", () => {
    const video = document.createElement("video");
    video.load = jest.fn();

    expect(applySafeMediaSource(video, "blob:https://example.com/source-video")).toBe(true);
    expect(video.load).toHaveBeenCalledTimes(1);

    expect(applySafeMediaSource(video, "blob:https://example.com/source-video")).toBe(true);
    expect(video.load).toHaveBeenCalledTimes(1);

    expect(applySafeMediaSource(video, null)).toBe(false);
    expect(video.load).toHaveBeenCalledTimes(2);
    expect(video.hasAttribute("src")).toBe(false);
  });
});
