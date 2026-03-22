import { API_ENDPOINTS } from "../config";

export const STORAGE_UPLOAD_LIMIT_MB = 500;

export function inferUploadMediaType(file, fallback = "video") {
  const inferred = file && typeof file.type === "string" ? file.type.split("/")[0] : "";
  return inferred || fallback;
}

function buildStructuredUploadError(result, fallbackMessage, httpStatus) {
  const serverErr =
    (result && (result.error || result.message || result.text)) ||
    fallbackMessage ||
    "Upload failed";
  const enrichedError = new Error(serverErr);
  if (result && typeof result === "object") {
    enrichedError.code = result.code;
    enrichedError.context = result.context || null;
    enrichedError.upgradeRequired = result.upgrade_required === true;
  }
  if (httpStatus) enrichedError.httpStatus = httpStatus;
  return enrichedError;
}

export function buildBackendUploadError(error) {
  if (error?.httpStatus || error?.code) return error;
  if (error instanceof TypeError) {
    return new Error("Upload request could not reach the backend. Check the API server and retry.");
  }
  return new Error(error?.message || "Upload failed. Please try again.");
}

export async function uploadSourceFileViaBackend({ file, token, mediaType, fileName, onProgress }) {
  if (!(file instanceof Blob)) {
    throw new Error("Upload requires a File or Blob.");
  }

  if (typeof onProgress === "function") {
    onProgress(0, file.size || 0);
  }

  const uploadUrl = new URL(API_ENDPOINTS.CONTENT_SOURCE_UPLOAD);
  uploadUrl.searchParams.set("mediaType", mediaType || inferUploadMediaType(file));
  uploadUrl.searchParams.set("fileName", fileName || file.name || "untitled");

  let response;
  try {
    response = await fetch(uploadUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
  } catch (error) {
    throw buildBackendUploadError(error);
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) {
    throw buildStructuredUploadError(result, "Failed to upload source media", response.status);
  }

  if (typeof onProgress === "function") {
    const size = file.size || result.size || 0;
    onProgress(size, size);
  }

  return result;
}
