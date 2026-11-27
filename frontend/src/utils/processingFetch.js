import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
const operations = {
  "/api/media/process": "studio.render",
  "/api/media/render-clip": "studio.render",
  "/api/media/analyze": "clips.analyze",
};
export async function processingFetch(url, options, fetcher, transportOptions) {
  if (process.env.REACT_APP_FREE_FIRST_USAGE !== "true")
    return fetcher(url, options, transportOptions);
  const operation = operations[new URL(url, window.location.origin).pathname];
  if (!operation || String(options.method || "GET").toUpperCase() !== "POST")
    return fetcher(url, options, transportOptions);
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error("Sign in to check processing capacity.");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const response = await fetch(`${API_BASE_URL}/api/usage/processing/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operation }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.message || "This operation needs cost validation before it can run.");
  const estimate = result.estimate;
  if (
    !window.confirm(
      `This operation reserves up to ${estimate.tokens} processing tokens. Unused capacity is restored after verified completion. Continue?`
    )
  )
    return new Response(
      JSON.stringify({
        error: "PROCESSING_DECLINED",
        message: "Processing cancelled. Your edit is preserved.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  const supplied = new Headers(options.headers || {});
  supplied.set("X-Processing-Tokens-Approved", String(estimate.tokens));
  if (!supplied.has("Idempotency-Key")) {
    let body;
    try {
      body = JSON.parse(options.body || "{}");
    } catch {
      body = {};
    }
    supplied.set("Idempotency-Key", body.requestId || body.request_id || crypto.randomUUID());
  }
  return fetcher(url, { ...options, headers: supplied }, transportOptions);
}
