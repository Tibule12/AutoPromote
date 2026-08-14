import { createRenderRequestId, fetchWithRenderTimeout } from "../renderRequest";

describe("render request safety", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("assigns a stable, non-empty request id", () => {
    expect(createRenderRequestId()).toMatch(/^[a-zA-Z0-9-]+$/);
  });

  test("aborts a render request at its deadline", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const request = fetchWithRenderTimeout("https://example.com/render", {}, { timeoutMs: 100 });
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    await expect(request).rejects.toMatchObject({ code: "RENDER_REQUEST_TIMEOUT" });
  });

  test("lets the active render request be cancelled", async () => {
    const controllerRef = { current: null };
    global.fetch = jest.fn((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const request = fetchWithRenderTimeout(
      "https://example.com/render",
      {},
      {
        timeoutMs: 10000,
        controllerRef,
      }
    );
    controllerRef.current.abort();

    await expect(request).rejects.toMatchObject({ code: "RENDER_REQUEST_CANCELLED" });
    expect(controllerRef.current).toBeNull();
  });
});
