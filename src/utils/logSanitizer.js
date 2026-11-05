// Lightweight logging sanitizer helpers for presence-only debug info
function present(x) {
  return !!x;
}

function tokenInfo(value) {
  if (!value) return { present: false };
  if (typeof value === "string") return { present: true, length: value.length };
  return { present: true };
}

function objSummary(obj) {
  if (!obj || typeof obj !== "object") return null;
  try {
    const keys = Object.keys(obj || {});
    const tokenKeys = keys.filter(k => /token|access|refresh|id_token/i.test(k));
    return { keys: keys.length, tokenKeys };
  } catch (e) {
    return null;
  }
}

function uriSummary(uri) {
  if (!uri) return { present: false };
  try {
    const u = new URL(uri);
    return { present: true, host: u.host, path: u.pathname };
  } catch (e) {
    return { present: true };
  }
}

function maskEmail(email) {
  try {
    if (!email) return null;
    const [local, domain] = String(email).split("@");
    if (!domain) return "***";
    const first = local ? local[0] : "";
    return `${first}***@${domain}`;
  } catch (e) {
    return "***";
  }
}

// Error strings may contain signed URLs or echoed request bodies. Keep logs
// bounded and remove capabilities rather than attempting to list every vendor's
// credential parameter. Never traverse/serialize Axios request/config objects.
function safeLogText(value, limit = 400) {
  if (typeof value !== "string") return "";
  return value
    .slice(0, 2048)
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL redacted]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(
      /\b(access_token|refresh_token|id_token|token|signature|code_verifier)\s*[=:]\s*[^\s,;"'&]+/gi,
      "$1=[redacted]"
    )
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[JWT redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .slice(0, limit);
}

function errorSummary(error) {
  return {
    name: safeLogText(error?.name || "Error", 60),
    message: safeLogText(typeof error === "string" ? error : error?.message || "Operation failed"),
    ...(Number.isInteger(error?.response?.status) ? { status: error.response.status } : {}),
  };
}

function requestLogPath(target) {
  // OAuth codes, state, tokens and signatures must not reach console or files.
  return safeLogText(String(target || "/").split(/[?#]/, 1)[0], 256);
}

function mediaOperationSummary(options = {}, jobId = null) {
  const viral = options.viralData || {};
  const count = value => (Array.isArray(value) ? value.length : 0);
  return {
    jobId: typeof jobId === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(jobId) ? jobId : null,
    operation: options.renderViral ? "render_clip" : options.analyzeClips ? "analyze" : "process",
    timelineSegments: count(viral.timeline_segments),
    overlays: count(viral.overlays),
    reframe: options.smartCrop === true,
    captions: options.captions === true,
    music: options.addMusic === true,
    hook: options.addHook === true,
  };
}

module.exports = {
  present,
  tokenInfo,
  objSummary,
  uriSummary,
  maskEmail,
  safeLogText,
  errorSummary,
  requestLogPath,
  mediaOperationSummary,
};
