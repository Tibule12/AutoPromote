import { API_BASE_URL } from "../config";

const reviewError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const nonempty = value => typeof value === "string" && value.trim().length > 0;

// The server verifies the Firebase bearer token and stores the decision under
// its derived UID. This response is an authenticated record reference, not a
// cryptographic signature over the local project document.
export const postStudioDirectorReviewDecision = async ({ proposal, decision, token, reviewerUid }) => {
  if (!proposal || !["approve", "reject"].includes(decision) || !nonempty(token) ||
      !nonempty(reviewerUid)) {
    reviewError("INVALID_SERVER_REVIEW_REQUEST", "A signed-in reviewer and proposal are required.");
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/studio/director/reviews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proposal, decision }),
    });
  } catch {
    reviewError("SERVER_REVIEW_UNAVAILABLE", "The review service is unavailable. No edit was applied.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    reviewError("SERVER_REVIEW_INVALID", "The review service returned an invalid response. No edit was applied.");
  }
  if (!response.ok) {
    if (response.status === 409 && payload?.error === "project_revision_missing") {
      reviewError("PROJECT_REVISION_MISSING",
        "The saved project version is missing. Review the edit again. No edit was applied.");
    }
    if (response.status === 409 && payload?.error === "project_revision_mismatch") {
      reviewError("PROJECT_REVISION_MISMATCH",
        "The project version differs from the server record. Review the edit again. No edit was applied.");
    }
    if (response.status === 409 && payload?.error === "project_revision_target_mismatch") {
      reviewError("PROJECT_REVISION_TARGET_MISMATCH",
        "The proposed edit targets different project content. Review the edit again. No edit was applied.");
    }
    if (response.status === 503 && payload?.error === "project_revision_unavailable") {
      reviewError("PROJECT_REVISION_UNAVAILABLE",
        "The review service could not verify the saved project version. Try again later. No edit was applied.");
    }
    if (response.status === 409 && payload?.error === "source_shot_evidence_mismatch") {
      reviewError("SOURCE_SHOT_EVIDENCE_MISMATCH",
        "The source-shot evidence does not match the server record. Analyze this source again. No edit was applied.");
    }
    if (response.status === 503 && payload?.error === "source_shot_evidence_unavailable") {
      reviewError("SOURCE_SHOT_EVIDENCE_UNAVAILABLE",
        "The review service could not verify the source-shot evidence. Try again later. No edit was applied.");
    }
    const message = response.status === 401 || response.status === 403
      ? "Your sign-in was not accepted by the review service. No edit was applied."
      : response.status === 409 && payload?.error === "review_conflict"
        ? "This proposal already has a different review decision. No edit was applied."
        : "The review service could not record this decision. No edit was applied.";
    reviewError("SERVER_REVIEW_FAILED", message);
  }
  if (payload?.ok !== true || !/^[a-f0-9]{64}$/.test(payload.serverReviewId || "") ||
      payload.projectId !== proposal.projectId ||
      payload.proposalId !== proposal.proposalId ||
      payload.baseRevision !== proposal.baseRevision ||
      payload.proposalFingerprint !== proposal.proposalFingerprint ||
      payload.decision !== decision || payload.reviewerUid !== reviewerUid ||
      !nonempty(payload.reviewedAt) || Number.isNaN(Date.parse(payload.reviewedAt)) ||
      typeof payload.duplicate !== "boolean") {
    reviewError("SERVER_REVIEW_MISMATCH", "The review service returned a different decision. No edit was applied.");
  }
  return payload;
};
