import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import activation from '../config/freeFirstActivation.json';
const operations = {
  "/api/media/process": "studio.render",
  "/api/media/render-clip": "studio.render",
  "/api/media/analyze": "clips.analyze",
  "/api/media/transcribe": "audio.transcribe",
  "/api/media/transcribe-source": "audio.transcribe",
  "/api/clips/analyze": "clips.analyze",
  "/api/clips/generate": "studio.render",
  "/api/clips/auto-generate": "studio.render",
  "/api/media/preview-silence": "studio.render",
  "/api/media/preview-music": "studio.render",
  "/api/media/preview-audio-remix": "studio.render",
  "/api/media/preview-watermark-cleanup": "studio.render",
  "/api/media/render-multicam": "multicam.render",
  "/api/media/extract-audio": "audio.extract",
  "/api/media/multicam/clean-audio-sync": "audio.sync",
  "/api/media/multicam/preflight-sync": "audio.sync",
};
export async function processingFetch(url, options, fetcher, transportOptions) {
  if (process.env.REACT_APP_FREE_FIRST_USAGE !== "true" && !activation.enabled)
    return fetcher(url, options, transportOptions);
  const path = new URL(url, window.location.origin).pathname;
  const operation = operations[path] || (/^\/api\/(?:captions|hashtags|chat)\//.test(path) ||
    /^\/api\/studio\/director\/creative-plan/.test(path) ? 'captions.generate' : null);
  if (new Headers(options.headers || {}).has('X-Processing-Tokens-Approved'))
    return fetcher(url, options, transportOptions);
  if (!operation || String(options.method || "GET").toUpperCase() !== "POST")
    return fetcher(url, options, transportOptions);
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error("Sign in to check processing capacity.");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const response = await fetch(`${API_BASE_URL}/api/usage/processing/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operation, path: new URL(url, window.location.origin).pathname,
      requestBody: typeof options.body === 'string' ? JSON.parse(options.body) : {} }),
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
  // The existing synchronous Finder endpoint can exceed the CDN's response
  // deadline on its bounded CPU lane. Both origins serve the same Render API;
  // preserve its normal request/response and durable financial identity.
  const actualUrl = ['/api/media/analyze', '/api/media/render-clip', '/api/clips/generate', '/api/media/multicam/preflight-sync'].includes(path) && new URL(url,window.location.origin).hostname === 'api.autopromote.org'
    ? 'https://autopromote.onrender.com'+path : url;
  return fetcher(actualUrl, { ...options, headers: supplied }, transportOptions);
}
export function installProcessingFetch() {
  if ((process.env.REACT_APP_FREE_FIRST_USAGE !== 'true' && !activation.enabled) || window.fetch.__processingAllowance) return;
  const original = window.fetch.bind(window);
  const wrapped = (url, options = {}) => {
    const target = typeof url === 'string' || url instanceof URL ? String(url) : url.url;
    if (new URL(target, window.location.origin).origin !== new URL(API_BASE_URL, window.location.origin).origin)
      return original(url, options);
    return processingFetch(target, options, original);
  };
  wrapped.__processingAllowance = true;
  window.fetch = wrapped;
}
