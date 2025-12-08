// Normalize API response shape across tests.
// Accepts either a raw JSON string, a fetch response `json` object, or an object
// like { status, body: <apiJson> } and returns an object with { status, body }.
function normalizeApiResponse(obj, explicitStatus) {
  if (!obj) return { status: explicitStatus || undefined, body: null };
  let parsed = obj;
  // Accept raw string JSON
  if (typeof obj === 'string') {
    try { parsed = JSON.parse(obj); } catch (e) { parsed = null; }
  }
  // If input is a fetch-style response body (e.g., { status, body: { ... } })
  if (parsed && typeof parsed === 'object' && parsed.body && typeof parsed.body === 'object') {
    return { status: explicitStatus || parsed.status, body: parsed.body };
  }
  // If input is already an API response (flattened)
  if (parsed && typeof parsed === 'object') {
    return { status: explicitStatus || parsed.status, body: parsed };
  }
  return { status: explicitStatus || undefined, body: null };
}

module.exports = normalizeApiResponse;
