const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024;
const CHUNK_ALIGNMENT = 256 * 1024;

export const normalizeResumableChunkSize = value => {
  const requested = Math.max(CHUNK_ALIGNMENT, Number(value || DEFAULT_CHUNK_SIZE));
  return Math.floor(requested / CHUNK_ALIGNMENT) * CHUNK_ALIGNMENT;
};

export const parseCommittedRange = value => {
  const match = String(value || "").match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
};

export const getAcknowledgedUploadOffset = ({ status, range, totalBytes }) => {
  if ([200, 201].includes(Number(status))) return Number(totalBytes) || 0;
  if (Number(status) !== 308) return null;
  const committedBytes = parseCommittedRange(range);
  return Math.min(Number(totalBytes) || 0, Math.max(0, committedBytes));
};

const requestJson = async (url, token, body, signal) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    const error = new Error(result.message || `Upload service returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
};

const sendUploadRequest = ({ uploadUrl, body, contentRange, contentType, signal, onProgress }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Range", contentRange);
    if (body?.size) {
      xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    }
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      resolve({ status: xhr.status, range: xhr.getResponseHeader("Range") || "" });
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("The cloud upload connection was interrupted"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      const error = new Error("Upload cancelled");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body || null);
  });

const queryCommittedBytes = async ({ uploadUrl, totalBytes, signal }) => {
  const response = await sendUploadRequest({
    uploadUrl,
    body: null,
    contentRange: `bytes */${totalBytes}`,
    signal,
  });
  if ([200, 201].includes(response.status)) return totalBytes;
  if (response.status !== 308) return 0;
  return parseCommittedRange(response.range);
};

export async function uploadMulticamSourceResumable({
  apiBaseUrl,
  token,
  getToken,
  file,
  purpose = "camera_original",
  signal,
  onProgress,
}) {
  if (!(file instanceof Blob) || !file.size) {
    throw new Error("A non-empty camera or audio file is required");
  }

  const resolveToken = async forceRefresh => {
    if (typeof getToken === "function") return getToken(forceRefresh === true);
    if (token) return token;
    throw new Error("A signed-in upload session is required");
  };

  const fingerprint = `${file.name || "media"}:${file.size}:${file.lastModified || 0}`;
  const startToken = await resolveToken(true);
  const session = await requestJson(
    `${apiBaseUrl}/api/media/multicam/uploads/start`,
    startToken,
    {
      fileName: file.name || "media.bin",
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      lastModified: file.lastModified || 0,
      fingerprint,
      purpose,
    },
    signal
  );

  try {
    const chunkSize = normalizeResumableChunkSize(session.chunkSizeBytes);
    let committedBytes = await queryCommittedBytes({
      uploadUrl: session.uploadUrl,
      totalBytes: file.size,
      signal,
    }).catch(() => 0);

    while (committedBytes < file.size) {
      const chunkStart = committedBytes;
      const chunkEnd = Math.min(file.size, chunkStart + chunkSize);
      const chunk = file.slice(chunkStart, chunkEnd);
      let acknowledged = false;
      let lastError = null;

      for (let attempt = 0; attempt < 4 && !acknowledged; attempt += 1) {
        try {
          const response = await sendUploadRequest({
            uploadUrl: session.uploadUrl,
            body: chunk,
            contentRange: `bytes ${chunkStart}-${chunkEnd - 1}/${file.size}`,
            contentType: file.type,
            signal,
            onProgress: loaded => {
              if (typeof onProgress === "function") {
                onProgress(Math.min(file.size, chunkStart + loaded), file.size);
              }
            },
          });
          const acknowledgedOffset = getAcknowledgedUploadOffset({
            status: response.status,
            range: response.range,
            totalBytes: file.size,
          });
          if (acknowledgedOffset === null) {
            throw new Error(`Cloud upload returned ${response.status}`);
          }
          if (acknowledgedOffset <= chunkStart && acknowledgedOffset < file.size) {
            throw new Error("Cloud upload did not acknowledge the chunk");
          }
          // GCS's Range header is authoritative. A server may persist only part
          // of a chunk, so the outer loop must rebuild the next slice from the
          // exact acknowledged offset instead of skipping to chunkEnd.
          committedBytes = acknowledgedOffset;
          acknowledged = true;
        } catch (error) {
          lastError = error;
          if (error?.name === "AbortError") throw error;

          const remoteBytes = await queryCommittedBytes({
            uploadUrl: session.uploadUrl,
            totalBytes: file.size,
            signal,
          }).catch(() => null);
          if (remoteBytes !== null && remoteBytes !== chunkStart) {
            committedBytes = Math.min(file.size, Math.max(0, remoteBytes));
            acknowledged = true;
            break;
          }
          if (attempt >= 3) break;
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }

      if (!acknowledged) throw lastError || new Error("Cloud upload failed");
      if (typeof onProgress === "function") onProgress(committedBytes, file.size);
    }

    // Firebase ID tokens are short-lived. Refresh after the potentially long
    // GCS transfer so completion cannot fail just because the upload took an hour.
    const completionToken = await resolveToken(true);
    return requestJson(
      `${apiBaseUrl}/api/media/multicam/uploads/complete`,
      completionToken,
      {
        storagePath: session.storagePath,
        downloadToken: session.downloadToken,
        sizeBytes: file.size,
      },
      signal
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      // Best-effort cleanup uses a fresh signal and token because the export's
      // AbortSignal is already cancelled.
      const abortToken = await resolveToken(true).catch(() => null);
      if (abortToken) {
        await requestJson(
          `${apiBaseUrl}/api/media/multicam/uploads/abort`,
          abortToken,
          { storagePath: session.storagePath },
          undefined
        ).catch(() => null);
      }
    }
    throw error;
  }
}
