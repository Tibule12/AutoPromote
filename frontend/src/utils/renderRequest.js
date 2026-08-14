export const RENDER_SUBMISSION_TIMEOUT_MS = 45000;
export const RENDER_STATUS_TIMEOUT_MS = 15000;

export const createRenderRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `render-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const waitForRenderRetry = (delayMs = 750) =>
  new Promise(resolve => setTimeout(resolve, delayMs));

export const fetchWithRenderTimeout = async (
  url,
  options = {},
  { timeoutMs, timeoutMessage, controllerRef } = {}
) => {
  const controller = new AbortController();
  let timedOut = false;
  const deadline = Number(timeoutMs) > 0 ? Number(timeoutMs) : RENDER_STATUS_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadline);

  if (controllerRef) controllerRef.current = controller;

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(
        timeoutMessage || "The render service did not respond before the request deadline."
      );
      timeoutError.code = "RENDER_REQUEST_TIMEOUT";
      throw timeoutError;
    }
    if (controller.signal.aborted) {
      const cancelledError = new Error("Processing cancelled by user.");
      cancelledError.code = "RENDER_REQUEST_CANCELLED";
      throw cancelledError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (controllerRef?.current === controller) controllerRef.current = null;
  }
};
