const KEY_PREFIX = "autopromote-viral-render-attempt:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const storageFor = uid => {
  if (typeof window === "undefined" || !uid) return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const keyFor = uid => `${KEY_PREFIX}${uid}`;

export const loadViralRenderAttempt = uid => {
  const storage = storageFor(uid);
  if (!storage) return null;
  try {
    const attempt = JSON.parse(storage.getItem(keyFor(uid)) || "null");
    if (
      !attempt ||
      typeof attempt.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(attempt.requestId) ||
      !Number.isFinite(attempt.createdAt) ||
      Date.now() - attempt.createdAt > MAX_AGE_MS
    ) {
      storage.removeItem(keyFor(uid));
      return null;
    }
    return attempt;
  } catch (_error) {
    return null;
  }
};

export const saveViralRenderAttempt = (uid, attempt) => {
  const storage = storageFor(uid);
  if (!storage || !attempt?.requestId) return;
  try {
    storage.setItem(
      keyFor(uid),
      JSON.stringify({
        requestId: attempt.requestId,
        createdAt: Number(attempt.createdAt) || Date.now(),
        captionReviewCopy: attempt.captionReviewCopy === true,
      })
    );
  } catch (_error) {
    // A blocked or full browser store must not prevent a render.
  }
};

export const clearViralRenderAttempt = (uid, requestId) => {
  const storage = storageFor(uid);
  if (!storage) return;
  try {
    if (!requestId || loadViralRenderAttempt(uid)?.requestId === requestId) {
      storage.removeItem(keyFor(uid));
    }
  } catch (_error) {
    // Recovery storage is optional.
  }
};
