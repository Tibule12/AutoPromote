const KEY_PREFIX = "autopromote-viral-render-attempt:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Recovery receipts contain owner-scoped request IDs, never tokens or media
// URLs. A transient signed-out auth event must not erase a paid/completed job.
// Access to that job is checked again by the server after authentication.
export const clearSessionPreservingRenderAttempts = () => {
  if (typeof window === "undefined") return;
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    keys.filter(key => key && !key.startsWith(KEY_PREFIX)).forEach(key => storage.removeItem(key));
  } catch (_error) { /* Browser storage may be unavailable. */ }
};

const storageFor = uid => {
  if (typeof window === "undefined" || !uid) return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const keyFor = uid => `${KEY_PREFIX}${uid}`;
const projectKeyFor = (uid, projectId) => `${keyFor(uid)}:project:${encodeURIComponent(projectId)}`;

export const loadViralRenderAttempt = (uid, projectId) => {
  const storage = storageFor(uid);
  if (!storage) return null;
  try {
    const scopedKey = projectId ? projectKeyFor(uid, projectId) : null;
    const stored = scopedKey && storage.getItem(scopedKey);
    const key = stored ? scopedKey : keyFor(uid);
    const attempt = JSON.parse(stored || storage.getItem(key) || "null");
    if (
      !attempt ||
      typeof attempt.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(attempt.requestId) ||
      !Number.isFinite(attempt.createdAt) ||
      Date.now() - attempt.createdAt > MAX_AGE_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    if (projectId && attempt.studioProjectId !== projectId) return null;
    if (scopedKey && !stored) {
      // Preserve a matching pre-project receipt before another project renders.
      try { storage.setItem(scopedKey, JSON.stringify(attempt)); } catch (_error) { /* Optional cache. */ }
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
    const value = JSON.stringify({
        requestId: attempt.requestId,
        createdAt: Number(attempt.createdAt) || Date.now(),
        captionReviewCopy: attempt.captionReviewCopy === true,
        ...(attempt.studioProjectId ? { studioProjectId: String(attempt.studioProjectId) } : {}),
        ...(typeof attempt.brandWatermark === "boolean" ? { brandWatermark: attempt.brandWatermark } : {}),
      });
    if (attempt.studioProjectId) storage.setItem(projectKeyFor(uid, String(attempt.studioProjectId)), value);
    storage.setItem(keyFor(uid), value);
  } catch (_error) {
    // A blocked or full browser store must not prevent a render.
  }
};

export const clearViralRenderAttempt = (uid, requestId, projectId) => {
  const storage = storageFor(uid);
  if (!storage) return;
  try {
    const latest = loadViralRenderAttempt(uid);
    const scoped = projectId ? loadViralRenderAttempt(uid, projectId) : latest;
    if (scoped?.studioProjectId && (!requestId || scoped.requestId === requestId)) {
      storage.removeItem(projectKeyFor(uid, scoped.studioProjectId));
    }
    if ((!projectId || latest?.studioProjectId === projectId) && (!requestId || latest?.requestId === requestId)) {
      storage.removeItem(keyFor(uid));
    }
  } catch (_error) {
    // Recovery storage is optional.
  }
};
