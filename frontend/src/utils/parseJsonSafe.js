export async function parseJsonSafe(response) {
  const contentType =
    (response.headers && response.headers.get && response.headers.get("content-type")) || "";
  const isJson = contentType.toLowerCase().includes("application/json");
  if (isJson) {
    try {
      const json = await response.json();
      return { ok: response.ok, status: response.status, json, contentType };
    } catch (e) {
      return {
        ok: response.ok,
        status: response.status,
        json: null,
        error: "invalid_json",
        contentType,
      };
    }
  }
  // Not JSON - try read text but avoid dumping full HTML
  try {
    const text = await response.text();
    // Return a short preview to avoid logging PII or HTML
    const preview = text.trim().slice(0, 250).replace(/\n/g, " ");
    return {
      ok: response.ok,
      status: response.status,
      json: null,
      textPreview: preview,
      contentType,
    };
  } catch (e) {
    return {
      ok: response.ok,
      status: response.status,
      json: null,
      error: "unknown_error",
      contentType,
    };
  }
}
