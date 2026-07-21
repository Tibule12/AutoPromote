import { API_ENDPOINTS } from "../config";
import { auth, storage } from "../firebaseClient";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

export const STORAGE_UPLOAD_LIMIT_MB = 500;
const TEMPORARY_SOURCE_PREFIXES = Object.freeze({
  viral_scan: "temp_scans",
  smart_promo: "temp_sources",
});

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

function sanitizeStorageFileName(fileName) {
  const raw = String(fileName || "untitled").trim() || "untitled";
  return Array.from(raw)
    .map(char => {
      const code = char.charCodeAt(0);
      const isAlphaNumeric =
        (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      return isAlphaNumeric || char === "." || char === "_" || char === "-" ? char : "_";
    })
    .join("")
    .slice(0, 120);
}

export async function uploadTemporaryVideoSource({ file, purpose, onProgress }) {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error("Please sign in again before uploading.");
  }
  if (!(file instanceof Blob)) {
    throw new Error("Upload requires a File or Blob.");
  }
  const prefix = TEMPORARY_SOURCE_PREFIXES[purpose];
  if (!prefix) {
    throw new Error("Invalid temporary upload purpose.");
  }
  if (file.size <= 0 || file.size > STORAGE_UPLOAD_LIMIT_MB * 1024 * 1024) {
    throw new Error(`Video uploads must be smaller than ${STORAGE_UPLOAD_LIMIT_MB} MB.`);
  }
  if (file.type && !file.type.startsWith("video/") && file.type !== "application/octet-stream") {
    throw new Error("The selected source must be a video.");
  }

  const safeFileName = sanitizeStorageFileName(file.name || "source-video");
  const storagePath = `${prefix}/${user.uid}/${Date.now()}_${safeFileName}`;
  const fileRef = ref(storage, storagePath);

  const snapshot = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        ownerUid: user.uid,
        source: "autopromote_secure_temporary_upload",
        sourcePurpose: purpose,
      },
    });

    task.on(
      "state_changed",
      state => {
        if (typeof onProgress === "function") {
          onProgress(state.bytesTransferred, state.totalBytes || file.size || 0);
        }
      },
      reject,
      () => resolve(task.snapshot)
    );
  });

  const size = snapshot.metadata?.size ? Number(snapshot.metadata.size) : file.size;
  return {
    ok: true,
    storagePath,
    size,
    uploadMode: "firebase_resumable_temporary",
  };
}

async function uploadSourceFileViaFirebase({ file, mediaType, fileName, onProgress }) {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error("Please sign in again before uploading.");
  }

  const safeMediaType = ["video", "image", "audio"].includes(mediaType) ? mediaType : inferUploadMediaType(file);
  const safeFileName = sanitizeStorageFileName(fileName || file.name || "untitled");
  const storagePath = `uploads/${safeMediaType}s/${user.uid}/${Date.now()}_${safeFileName}`;
  const fileRef = ref(storage, storagePath);

  const snapshot = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        ownerUid: user.uid,
        source: "unified_publisher_client_upload",
      },
    });

    task.on(
      "state_changed",
      state => {
        if (typeof onProgress === "function") {
          onProgress(state.bytesTransferred, state.totalBytes || file.size || 0);
        }
      },
      reject,
      () => resolve(task.snapshot)
    );
  });

  const url = await getDownloadURL(snapshot.ref);
  const size = snapshot.metadata?.size ? Number(snapshot.metadata.size) : file.size || 0;
  return {
    ok: true,
    storagePath,
    url,
    size,
    uploadMode: "firebase_resumable",
  };
}

async function uploadSourceFileViaBackendRequest({ file, token, mediaType, fileName, onProgress }) {
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

export async function uploadSourceFileViaBackend({ file, token, mediaType, fileName, onProgress }) {
  if (!(file instanceof Blob)) {
    throw new Error("Upload requires a File or Blob.");
  }

  const normalizedMediaType = mediaType || inferUploadMediaType(file);
  try {
    return await uploadSourceFileViaFirebase({
      file,
      mediaType: normalizedMediaType,
      fileName,
      onProgress,
    });
  } catch (firebaseError) {
    console.warn("Firebase resumable upload failed, falling back to backend upload:", firebaseError);
    return uploadSourceFileViaBackendRequest({
      file,
      token,
      mediaType: normalizedMediaType,
      fileName,
      onProgress,
    });
  }
}
