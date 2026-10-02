const crypto = require("crypto");

const replayError = (code, statusCode, cause) => Object.assign(
  new Error(code), { code, statusCode, ...(cause ? { cause } : {}) }
);

const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);

// The committed CommonJS bundle is built directly from the browser's pure
// studioCommands module. Node never transpiles source or starts a browser while
// handling a review request.
const computeStudioDirectorPreviewFingerprint = ({ document, batch }) => {
  let dryRunStudioCommandBatch;
  try {
    ({ dryRunStudioCommandBatch } = require("../generated/studioDirectorReplayKernel.cjs"));
    if (typeof dryRunStudioCommandBatch !== "function") throw new Error("Replay kernel missing");
  } catch (error) {
    throw replayError("DIRECTOR_REPLAY_UNAVAILABLE", 503, error);
  }

  let preview;
  try {
    preview = dryRunStudioCommandBatch(document, batch);
  } catch (error) {
    if (typeof error?.code === "string") {
      throw replayError("DIRECTOR_REPLAY_REJECTED", 409, error);
    }
    throw replayError("DIRECTOR_REPLAY_UNAVAILABLE", 503, error);
  }
  if (preview?.duplicate) throw replayError("DIRECTOR_REPLAY_REJECTED", 409);
  try {
    const canonical = stableStringify(preview.previewDocument);
    if (typeof canonical !== "string") throw new Error("Preview document missing");
    return crypto.createHash("sha256").update(canonical).digest("hex");
  } catch (error) {
    throw replayError("DIRECTOR_REPLAY_UNAVAILABLE", 503, error);
  }
};

module.exports = { computeStudioDirectorPreviewFingerprint };
