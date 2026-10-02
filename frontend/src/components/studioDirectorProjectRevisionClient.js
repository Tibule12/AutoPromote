import { API_BASE_URL } from "../config";

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const nonempty = value => typeof value === "string" && value.trim().length > 0;

// Register the exact document frozen for the preview. The server computes its
// own fingerprint and binds this revision to the Firebase token's owner.
export const registerStudioDirectorProjectRevision = async ({ document, proposal, token }) => {
  if (!document || !proposal || !nonempty(token) ||
      document.projectId !== proposal.projectId || document.revision !== proposal.baseRevision ||
      !/^[a-f0-9]{64}$/.test(proposal.documentFingerprint || "")) {
    fail("INVALID_PROJECT_REVISION_REQUEST", "The preview has no matching project version. Review the edit again.");
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/studio/director/projects/revisions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ document }),
    });
  } catch {
    fail("PROJECT_REVISION_UNAVAILABLE", "The project version service is unavailable. No edit was applied.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    fail("PROJECT_REVISION_INVALID", "The project version service returned an invalid response. No edit was applied.");
  }
  if (!response.ok) {
    if (response.status === 409 && payload?.error === "project_revision_stale") {
      fail("PROJECT_REVISION_STALE", "The server has a newer project version. Review the edit again. No edit was applied.");
    }
    if (response.status === 409) {
      fail("PROJECT_REVISION_CONFLICT", "This project version differs from the saved version. Review the edit again. No edit was applied.");
    }
    if (response.status === 413) {
      fail("PROJECT_REVISION_TOO_LARGE", "This project version exceeds the service size limit. No edit was applied.");
    }
    if (response.status === 401 || response.status === 403) {
      fail("PROJECT_REVISION_AUTH", "Your sign-in was not accepted by the project version service. No edit was applied.");
    }
    fail("PROJECT_REVISION_FAILED", "The project version service could not save this version. No edit was applied.");
  }
  if (payload?.ok !== true || payload.projectId !== proposal.projectId ||
      payload.revision !== proposal.baseRevision ||
      payload.documentFingerprint !== proposal.documentFingerprint ||
      !/^[a-f0-9]{64}$/.test(payload.serverRevisionId || "") ||
      !nonempty(payload.registeredAt) || Number.isNaN(Date.parse(payload.registeredAt)) ||
      typeof payload.duplicate !== "boolean") {
    fail("PROJECT_REVISION_MISMATCH", "The project version service returned a different version. No edit was applied.");
  }
  return payload;
};
