import { applySafeMediaSource, sanitizeMediaUrl, getSafeMediaSource, reloadMediaElement } from "../security";

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
    const nativeLoad = jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    video.load = jest.fn(() => { throw new Error("Untrusted own load method"); });

    expect(applySafeMediaSource(video, "blob:https://example.com/source-video")).toBe(true);
    expect(nativeLoad).toHaveBeenCalledTimes(1);

    expect(applySafeMediaSource(video, "blob:https://example.com/source-video")).toBe(true);
    expect(nativeLoad).toHaveBeenCalledTimes(1);

    expect(applySafeMediaSource(video, null)).toBe(false);
    expect(nativeLoad).toHaveBeenCalledTimes(2);
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.load).not.toHaveBeenCalled();
    nativeLoad.mockRestore();
  });
});


test("React media attributes preserve signatures and encode HTML delimiters", () => {
  const signed = "https://storage.googleapis.com/bucket/video.mp4?X-Goog-Signature=a%2Bb%2Fc%3D";
  expect(getSafeMediaSource(signed)).toBe(signed);
  expect(getSafeMediaSource('javascript:alert(1)')).toBeUndefined();
  expect(getSafeMediaSource('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
  expect(getSafeMediaSource('blob:https://example.com/<img onerror="attack">')).not.toMatch(/[<>" ]/);
  expect(getSafeMediaSource('data:image/png;base64,aGVsbG8=')).toBe('data:image/png;base64,aGVsbG8=');
});

test("native media reload ignores an overridden instance method", () => {
  const video = document.createElement('video');
  const nativeLoad = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  video.load = jest.fn();
  try {
    reloadMediaElement(video);
    expect(nativeLoad).toHaveBeenCalledTimes(1);
    expect(video.load).not.toHaveBeenCalled();
    reloadMediaElement(document.createElement('div'));
    expect(nativeLoad).toHaveBeenCalledTimes(1);
  } finally { nativeLoad.mockRestore(); }
});
