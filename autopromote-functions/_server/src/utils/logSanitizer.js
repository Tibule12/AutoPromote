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

module.exports = { present, tokenInfo, objSummary, uriSummary, maskEmail };
