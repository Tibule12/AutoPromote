import { act, renderHook } from "@testing-library/react";
import { useMediaProcessor } from "../useMediaProcessor";

describe("useMediaProcessor", () => {
  it("previews a remote rendered master without re-uploading it", () => {
    const masterUrl = "https://storage.example.com/processed/multicam_job.mp4?token=abc";
    const { result } = renderHook(() => useMediaProcessor());

    act(() => result.current.handleFileChange(masterUrl));

    expect(result.current.file).toBe(masterUrl);
    expect(result.current.sourceFiles).toEqual([masterUrl]);
    expect(result.current.previewUrl).toBe(masterUrl);
    expect(result.current.type).toBe("video");
  });

  it("recognizes a remote image from its URL path", () => {
    const imageUrl = "https://storage.example.com/cover.webp?token=abc";
    const { result } = renderHook(() => useMediaProcessor());

    act(() => result.current.handleFileChange(imageUrl));

    expect(result.current.previewUrl).toBe(imageUrl);
    expect(result.current.type).toBe("image");
  });
});
