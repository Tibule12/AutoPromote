const express = require("express");
const request = require("supertest");

const emptyQuerySnapshot = { empty: true, docs: [] };

const mockWorkspaceCollection = {
  where: jest.fn(() => mockWorkspaceCollection),
  limit: jest.fn(() => mockWorkspaceCollection),
  get: jest.fn(async () => emptyQuerySnapshot),
  doc: jest.fn(() => ({ get: jest.fn(async () => ({ exists: false })) })),
};
const mockMembershipCollection = {
  where: jest.fn(() => mockMembershipCollection),
  limit: jest.fn(() => mockMembershipCollection),
  get: jest.fn(async () => emptyQuerySnapshot),
};

jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: jest.fn(() => mockWorkspaceCollection),
    collectionGroup: jest.fn(() => mockMembershipCollection),
  },
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => "server-time"),
    },
  },
}));

jest.mock("../../authMiddleware", () => (req, _res, next) => {
  req.userId = "workspace-user";
  req.user = { uid: "workspace-user", email: "owner@example.com" };
  next();
});

jest.mock("../../services/emailService", () => ({
  sendWorkspaceInvitation: jest.fn(),
}));

const workspaceRoutes = require("../workspaceRoutes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/workspaces", workspaceRoutes);
  return app;
}

describe("GET /api/workspaces/current", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns 200 for a user who has not created or joined a workspace", async () => {
    const response = await request(buildApp()).get("/api/workspaces/current");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      empty: true,
      workspace: null,
      membership: null,
      members: [],
      pendingInvites: [],
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canEdit: false,
        canPublish: false,
      },
    });
  });

  test("keeps 404 for an explicitly requested stale workspace id", async () => {
    const response = await request(buildApp())
      .get("/api/workspaces/current")
      .set("X-Workspace-Id", "deleted-workspace");

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ ok: false, error: "workspace_not_found" });
  });
});
