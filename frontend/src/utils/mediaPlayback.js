const EXPECTED_PLAYBACK_INTERRUPTION =
  /(play\(\) request was interrupted|interrupted by a call to pause|new load request|media was removed)/i;

export const isExpectedMediaPlaybackInterruption = error => {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  return EXPECTED_PLAYBACK_INTERRUPTION.test(String(error.message || error));
};

export const playMediaSafely = (mediaElement, { onUnexpectedError } = {}) => {
  if (!mediaElement || typeof mediaElement.play !== "function") {
    return Promise.resolve(false);
  }

  try {
    return Promise.resolve(mediaElement.play())
      .then(() => true)
      .catch(error => {
        if (!isExpectedMediaPlaybackInterruption(error)) {
          onUnexpectedError?.(error);
        }
        return false;
      });
  } catch (error) {
    if (!isExpectedMediaPlaybackInterruption(error)) {
      onUnexpectedError?.(error);
    }
    return Promise.resolve(false);
  }
};
