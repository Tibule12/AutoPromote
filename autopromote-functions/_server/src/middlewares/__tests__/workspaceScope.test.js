const mockWorkspaceGet = jest.fn();
const mockMemberGet = jest.fn();
jest.mock("../../config/teamRollout", () => ({
  ...jest.requireActual("../../config/teamRollout"),
  teamCollaborationAvailable: jest.fn(() => true),
}));

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
    require("../../config/teamRollout").teamCollaborationAvailable.mockReturnValue(true);
    mockWorkspaceGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerUid: "owner-1", name: "Team" }),
    });
  });

  test("preserves the authenticated actor and selects the owner only as resource context", async () => {
    mockMemberGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: "editor-1", role: "editor", status: "active" }),
    });
    const req = {
      method: "GET",
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
    expect(req.userId).toBe("editor-1");
    expect(req.user.uid).toBe("editor-1");
    expect(workspaceScope.resourceUserId(req)).toBe("owner-1");
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

  test("disabled shared context never reads an owner or impersonates a member", async () => {
    require("../../config/teamRollout").teamCollaborationAvailable.mockReturnValue(false);
    const req = { headers: { "x-workspace-id": "unreviewed-team" }, user: { uid: "actor" } };
    const res = responseMock(), next = jest.fn();
    await workspaceScope(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockWorkspaceGet).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(req.user.uid).toBe("actor");
  });
});
