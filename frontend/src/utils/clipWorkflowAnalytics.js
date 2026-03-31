import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";

const MAX_EVENT_NAME_LENGTH = 64;
const MAX_WORKFLOW_LENGTH = 64;
let workflowTrackingUnavailable = false;

const normalizeString = (value, fallback = "") =>
  String(value ?? fallback)
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 200);

const sanitizeProperties = properties => {
  if (!properties || typeof properties !== "object") return {};

  return Object.entries(properties).reduce((accumulator, [key, value]) => {
    const normalizedKey = normalizeString(key).slice(0, 80);
    if (!normalizedKey) return accumulator;

    if (value === null || value === undefined) return accumulator;
    if (typeof value === "number" || typeof value === "boolean") {
      accumulator[normalizedKey] = value;
      return accumulator;
    }

    if (typeof value === "string") {
      accumulator[normalizedKey] = normalizeString(value);
      return accumulator;
    }

    if (Array.isArray(value)) {
      accumulator[normalizedKey] = value
        .slice(0, 10)
        .map(item => (typeof item === "string" ? normalizeString(item) : item))
        .filter(item => item !== null && item !== undefined);
      return accumulator;
    }

    if (typeof value === "object") {
      accumulator[normalizedKey] = Object.fromEntries(
        Object.entries(value)
          .slice(0, 20)
          .map(([nestedKey, nestedValue]) => [normalizeString(nestedKey).slice(0, 80), nestedValue])
          .filter(([nestedKey, nestedValue]) => nestedKey && nestedValue !== undefined)
      );
    }

    return accumulator;
  }, {});
};

export async function trackClipWorkflowEvent(
  eventName,
  properties = {},
  workflow = "clip_scanner"
) {
  try {
    if (workflowTrackingUnavailable) return false;

    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== "function") return false;

    const token = await user.getIdToken();
    if (!token) return false;

    const response = await fetch(`${API_BASE_URL}/api/analytics/workflow-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workflow: normalizeString(workflow, "clip_scanner").slice(0, MAX_WORKFLOW_LENGTH),
        eventName: normalizeString(eventName).slice(0, MAX_EVENT_NAME_LENGTH),
        properties: sanitizeProperties(properties),
      }),
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        workflowTrackingUnavailable = true;
      }
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

export default trackClipWorkflowEvent;
