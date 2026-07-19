const mockWorkspaceGet = jest.fn();
const mockMemberGet = jest.fn();

jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockWorkspaceGet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: mockMemberGet })),
        })),
      })),
    })),
  },
}));

const workspaceScope = require("../workspaceScope");

function responseMock() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("workspaceScope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerUid: "owner-1", name: "Team" }),
    });
  });

  test("scopes an editor request to the workspace owner while preserving the actor", async () => {
    mockMemberGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: "editor-1", role: "editor", status: "active" }),
    });
    const req = {
      method: "POST",
      headers: { "x-workspace-id": "workspace-1" },
      query: {},
      userId: "editor-1",
      user: { uid: "editor-1", email: "editor@example.com" },
    };
    const res = responseMock();
    const next = jest.fn();

    await workspaceScope(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.actorUserId).toBe("editor-1");
    expect(req.userId).toBe("owner-1");
    expect(req.workspaceRole).toBe("editor");
  });

  test("keeps viewers read-only", async () => {
    mockMemberGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: "viewer-1", role: "viewer", status: "active" }),
    });
    const req = {
      method: "DELETE",
      headers: { "x-workspace-id": "workspace-1" },
      query: {},
      userId: "viewer-1",
      user: { uid: "viewer-1" },
    };
    const res = responseMock();
    const next = jest.fn();

    await workspaceScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "workspace_read_only" });
  });
});
