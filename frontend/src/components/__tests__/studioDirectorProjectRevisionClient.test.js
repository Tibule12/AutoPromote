import { API_BASE_URL } from "../../config";
import { registerStudioDirectorProjectRevision } from "../studioDirectorProjectRevisionClient";

const document = { schemaVersion: 1, projectId: "project-1", revision: 4, assets: [] };
const proposal = {
  projectId: "project-1", baseRevision: 4, documentFingerprint: "a".repeat(64),
};
const serverResponse = overrides => ({
  ok: true,
  projectId: proposal.projectId,
  revision: proposal.baseRevision,
  documentFingerprint: proposal.documentFingerprint,
  serverRevisionId: "f".repeat(64),
  registeredAt: "2026-09-30T12:00:00.000Z",
  duplicate: false,
  ...overrides,
});
const register = () => registerStudioDirectorProjectRevision({ document, proposal, token: "firebase-token" });

describe("Director project revision server client", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test("posts the frozen document with Firebase bearer token and verifies its identity", async () => {
    const payload = serverResponse();
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 201, json: () => Promise.resolve(payload),
    }));
    await expect(register()).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/studio/director/projects/revisions`,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer firebase-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document }),
      })
    );
  });

  test("fails closed on request, service, conflict and response mismatch", async () => {
    global.fetch = jest.fn();
    await expect(registerStudioDirectorProjectRevision({
      document, proposal: { ...proposal, baseRevision: 5 }, token: "firebase-token",
    })).rejects.toMatchObject({ code: "INVALID_PROJECT_REVISION_REQUEST" });
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_UNAVAILABLE" });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 409, json: () => Promise.resolve({ error: "project_revision_conflict" }),
    }));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 409, json: () => Promise.resolve({ error: "project_revision_stale" }),
    }));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_STALE" });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 413, json: () => Promise.resolve({ error: "project_revision_too_large" }),
    }));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_TOO_LARGE" });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false, status: 401, json: () => Promise.resolve({ error: "unauthorized" }),
    }));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_AUTH" });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.reject(new Error("invalid JSON")),
    }));
    await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_INVALID" });

    for (const override of [
      { projectId: "another-project" }, { revision: 5 },
      { documentFingerprint: "b".repeat(64) }, { serverRevisionId: "not-a-hash" },
      { duplicate: "yes" },
    ]) {
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true, status: 201, json: () => Promise.resolve(serverResponse(override)),
      }));
      await expect(register()).rejects.toMatchObject({ code: "PROJECT_REVISION_MISMATCH" });
    }
  });
});
