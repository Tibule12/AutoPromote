import { API_BASE_URL } from "../../config";
import { postStudioDirectorReviewDecision } from "../studioDirectorReviewClient";

const proposal = {
  projectId: "project-1",
  proposalId: "proposal-1",
  baseRevision: 4,
  proposalFingerprint: "a".repeat(64),
};
const serverResponse = overrides => ({
  ok: true,
  serverReviewId: "f".repeat(64),
  projectId: proposal.projectId,
  proposalId: proposal.proposalId,
  baseRevision: proposal.baseRevision,
  proposalFingerprint: proposal.proposalFingerprint,
  decision: "approve",
  reviewerUid: "human-1",
  reviewedAt: "2026-09-29T12:00:00.000Z",
  duplicate: false,
  ...overrides,
});
const submit = () => postStudioDirectorReviewDecision({
  proposal, decision: "approve", token: "firebase-token", reviewerUid: "human-1",
});

const rejectCode = async (work, code) => {
  let failure;
  try { await work; } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code });
};

describe("Director review server client", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test("posts the complete proposal with Firebase bearer token and accepts exact server binding", async () => {
    const payload = serverResponse();
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(payload),
    }));
    await expect(submit()).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/studio/director/reviews`,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer firebase-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposal, decision: "approve" }),
      })
    );
  });

  test("fails closed on network, auth, malformed and mismatched decisions", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    await rejectCode(submit(), "SERVER_REVIEW_UNAVAILABLE");

    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 401, json: () => Promise.resolve({ error: "unauthorized" }),
    }));
    await rejectCode(submit(), "SERVER_REVIEW_FAILED");

    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.reject(new Error("invalid JSON")),
    }));
    await rejectCode(submit(), "SERVER_REVIEW_INVALID");

    for (const override of [
      { reviewerUid: "another-user" },
      { decision: "reject" },
      { proposalFingerprint: "b".repeat(64) },
      { projectId: "another-project" },
      { baseRevision: 5 },
    ]) {
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true, status: 200, json: () => Promise.resolve(serverResponse(override)),
      }));
      await rejectCode(submit(), "SERVER_REVIEW_MISMATCH");
    }
    global.fetch = jest.fn();
    await rejectCode(postStudioDirectorReviewDecision({
      proposal, decision: "approve", token: "", reviewerUid: "human-1",
    }), "INVALID_SERVER_REVIEW_REQUEST");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("reports unverified source-shot evidence without claiming a decision conflict", async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 409,
      json: () => Promise.resolve({ error: "source_shot_evidence_mismatch" }),
    }));
    await expect(submit()).rejects.toMatchObject({
      code: "SOURCE_SHOT_EVIDENCE_MISMATCH",
      message: expect.stringMatching(/Analyze this source again/),
    });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 503,
      json: () => Promise.resolve({ error: "source_shot_evidence_unavailable" }),
    }));
    await rejectCode(submit(), "SOURCE_SHOT_EVIDENCE_UNAVAILABLE");
  });
});
