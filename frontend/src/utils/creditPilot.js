import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";

export function creditPilotEnabled() {
  if (process.env.REACT_APP_CREDITS_PILOT !== "true") return false;
  try {
    return (
      window.location.hostname === "127.0.0.1" &&
      new URL(API_BASE_URL).hostname === "127.0.0.1" &&
      process.env.REACT_APP_FIREBASE_PROJECT_ID === "demo-autopromote-credits"
    );
  } catch {
    return false;
  }
}
const stateKey = uid => `autopromote-credit-operations:${uid}`;
function read(uid) {
  try {
    return JSON.parse(localStorage.getItem(stateKey(uid)) || "{}");
  } catch {
    return {};
  }
}
function save(uid, data) {
  localStorage.setItem(stateKey(uid), JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("autopromote-credit-refresh"));
}
const stable = value =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, stable(value[key])])
        )
      : value;
async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
export function pilotOperationFor(url, method = "POST") {
  if (method !== "POST") return null;
  const path = new URL(url, API_BASE_URL).pathname;
  if (path === "/api/media/process") return "studio.render";
  if (["/api/media/analyze", "/api/clips/analyze"].includes(path)) return "clips.analyze";
  if (["/api/media/render-clip", "/api/clips/generate"].includes(path)) return "clips.render";
  if (path === "/api/content/upload") return "publisher.publish";
  if (
    path === "/api/promotion-tasks/platform/enqueue" ||
    /\/promotion-schedules(?:\/[^/]+\/(?:resume|reschedule))?$/.test(path)
  )
    return "queue.dispatch";
  return null;
}
export async function pilotApi(path, body) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in before using credits.");
  const response = await fetch(`${API_BASE_URL}/api/credit-pilot${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.message || data.error || "Credit request failed"), {
      code: data.code || data.error,
    });
  return data;
}
export function savedCreditOperations(uid) {
  return Object.values(read(uid));
}
export async function refreshCreditOperations() {
  if (!creditPilotEnabled() || !auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const states = read(uid);
  for (const [key, operation] of Object.entries(states)) {
    if (
      !operation.operationId ||
      ["succeeded", "failed", "cancelled", "rejected"].includes(operation.state)
    )
      continue;
    try {
      const outcome = await pilotApi(`/reconcile/${operation.operationId}`, {});
      if (auth.currentUser?.uid !== uid) return null;
      states[key] = { ...operation, ...outcome };
    } catch {
      /* Network/worker uncertainty retains the operation and its hold. */
    }
  }
  save(uid, states);
  return pilotApi("/account");
}
function declined(message, code, status = 409) {
  return new Response(JSON.stringify({ success: false, error: message, message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export async function creditFetch(url, options = {}, fetcher = fetch, transportOptions) {
  if (!creditPilotEnabled()) return fetcher(url, options, transportOptions);
  const operation = pilotOperationFor(url, options.method || "GET");
  if (!operation) return fetcher(url, options, transportOptions);
  const user = auth.currentUser;
  if (!user) return declined("Please sign in.", "AUTH_REQUIRED", 401);
  const requestBody = options.body ? JSON.parse(options.body) : {};
  if (requestBody.isDryRun) return fetcher(url, options, transportOptions);
  const route = new URL(url, API_BASE_URL).pathname;
  const key = await digest({ route, operation, requestBody });
  const entries = read(user.uid);
  const prior = entries[key];
  const previous = ["succeeded", "failed", "cancelled", "rejected"].includes(prior?.state)
    ? null
    : prior;
  const quote = await pilotApi("/prepare", { operation, route, requestBody });
  if (quote.reuseOperationId) {
    const headers = new Headers(options.headers || {});
    headers.set("X-Credits-Operation", quote.reuseOperationId);
    return fetcher(url, { ...options, headers }, transportOptions);
  }
  if (!quote.canAfford && !previous?.operationId)
    return declined(
      "Not enough credits. Your project is safe; editing, saving and reopening remain available.",
      "INSUFFICIENT_CREDITS",
      402
    );
  let approved =
    previous?.approvedCredits === quote.credits &&
    previous?.pricingRevision === quote.pricingRevision;
  if (!approved) {
    approved = await new Promise(resolve => {
      window.dispatchEvent(
        new CustomEvent("autopromote-credit-consent", { detail: { quote, operation, resolve } })
      );
    });
  }
  if (!approved || auth.currentUser?.uid !== user.uid)
    return declined(
      "Operation cancelled. Keep editing and saving your project.",
      "CREDIT_CONSENT_CANCELLED"
    );
  const requestId = previous?.requestId || crypto.randomUUID();
  const entry = {
    ...previous,
    requestId,
    operationId: await digest([user.uid, requestId]),
    operation,
    approvedCredits: quote.credits,
    pricingRevision: quote.pricingRevision,
    state: "submitting",
    createdAt: previous?.createdAt || new Date().toISOString(),
  };
  entries[key] = entry;
  save(user.uid, entries);
  const headers = new Headers(options.headers || {});
  headers.set("X-Credits-Quote", quote.quoteId);
  headers.set("X-Credits-Request", requestId);
  headers.set("X-Credits-Approved", String(quote.credits));
  headers.set("X-Credits-Revision", quote.pricingRevision);
  try {
    const response = await fetcher(url, { ...options, headers }, transportOptions);
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));
    entries[key] = {
      ...entry,
      operationId: data.creditOperationId || data.operationId || entry.operationId,
      state:
        data.state ||
        (response.ok
          ? "running"
          : response.status < 500 && !data.creditOperationId
            ? "rejected"
            : "uncertain"),
    };
    save(user.uid, entries);
    return response;
  } catch (error) {
    entries[key] = { ...entry, state: "uncertain" };
    save(user.uid, entries);
    throw error;
  }
}
