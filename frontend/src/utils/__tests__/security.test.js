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

    expect(applySafeMediaSource(image, "javascript:alert(1)")).toBe(false);
    expect(image.hasAttribute("src")).toBe(false);
  });
});
