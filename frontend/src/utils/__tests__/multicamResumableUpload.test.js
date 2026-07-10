import {
  getAcknowledgedUploadOffset,
  normalizeResumableChunkSize,
  parseCommittedRange,
  uploadMulticamSourceResumable,
} from "../multicamResumableUpload";

describe("multicam resumable upload helpers", () => {
  it("keeps chunk sizes aligned to the GCS 256 KiB boundary", () => {
    expect(normalizeResumableChunkSize(16 * 1024 * 1024 + 100)).toBe(16 * 1024 * 1024);
    expect(normalizeResumableChunkSize(1)).toBe(256 * 1024);
  });

  it("converts the committed Range response into the next byte offset", () => {
    expect(parseCommittedRange("bytes=0-16777215")).toBe(16777216);
    expect(parseCommittedRange(null)).toBe(0);
  });

  it("treats a partial GCS chunk acknowledgement as the exact resume offset", () => {
    expect(
      getAcknowledgedUploadOffset({
        status: 308,
        range: "bytes=0-4194303",
        totalBytes: 32 * 1024 * 1024,
      })
    ).toBe(4 * 1024 * 1024);
  });

  it("marks a completed upload at the full file size", () => {
    expect(
      getAcknowledgedUploadOffset({ status: 200, range: "", totalBytes: 12345 })
    ).toBe(12345);
    expect(
      getAcknowledgedUploadOffset({ status: 503, range: "", totalBytes: 12345 })
    ).toBeNull();
  });

  it("refreshes authentication after the byte transfer before completing", async () => {
    const originalFetch = global.fetch;
    const originalXhr = global.XMLHttpRequest;
    const getToken = jest
      .fn()
      .mockResolvedValueOnce("start-token")
      .mockResolvedValueOnce("completion-token");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          uploadUrl: "https://upload.example/session",
          storagePath: "temp/multicam-ingest/user/file.mp4",
          downloadToken: "download-token",
          chunkSizeBytes: 256 * 1024,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, url: "https://storage.example/file.mp4" }),
      });

    class FakeXhr {
      constructor() {
        this.upload = {};
        this.status = 0;
        this.range = "";
      }
      open() {}
      setRequestHeader() {}
      getResponseHeader(name) {
        return name === "Range" ? this.range : "";
      }
      send(body) {
        if (body) {
          this.status = 200;
        } else {
          this.status = 308;
          this.range = "";
        }
        this.onload();
      }
      abort() {
        this.onabort?.();
      }
    }

    global.fetch = fetchMock;
    global.XMLHttpRequest = FakeXhr;
    try {
      const file = new Blob([new Uint8Array(1024)], { type: "video/mp4" });
      Object.defineProperties(file, {
        name: { value: "camera.mp4" },
        lastModified: { value: 123 },
      });
      await uploadMulticamSourceResumable({
        apiBaseUrl: "https://api.example",
        getToken,
        file,
      });

      expect(getToken).toHaveBeenNthCalledWith(1, true);
      expect(getToken).toHaveBeenNthCalledWith(2, true);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer start-token");
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer completion-token");
    } finally {
      global.fetch = originalFetch;
      global.XMLHttpRequest = originalXhr;
    }
  });
});
