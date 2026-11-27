jest.mock("../../firebaseAdmin", () => ({ db: {} }));
const { inScope } = require("../teamContentBoundary");
const personal = { method: "GET", user: { uid: "owner" }, userId: "owner" };
const legacy = { user_id: "owner", workspace_id: "historical-owner-workspace", url: "https://example.test/movie.mp4" };

test("an owner's historical workspace-stamped upload remains readable in personal Queue", () => {
  expect(inScope(personal, legacy)).toBe(true);
  expect(inScope({ ...personal, method: "HEAD" }, legacy)).toBe(true);
});

test.each(["POST", "PUT", "PATCH", "DELETE"])("historical read compatibility cannot permit a %s", method => {
  expect(inScope({ ...personal, method }, legacy)).toBe(false);
});

test("another owner, conflicting owner aliases or owner impersonation cannot use the exception", () => {
  expect(inScope({ ...personal, user: { uid: "attacker" } }, legacy)).toBe(false);
  expect(inScope(personal, { ...legacy, uid: "another-user" })).toBe(false);
  expect(inScope({ method: "GET" }, legacy)).toBe(false);
  expect(inScope(personal, { workspace_id: legacy.workspace_id })).toBe(false);
});

test.each(["teamReleaseId", "teamApproval", "teamReleaseRevision"])("reviewed Team field %s retains personal/team separation", field => {
  expect(inScope(personal, { ...legacy, [field]: field === "teamReleaseRevision" ? 1 : "reviewed" })).toBe(false);
});

test("selected Team scope remains exact and does not include personal or other-team content", () => {
  const team = { ...personal, workspaceId: "team-a" };
  expect(inScope(team, { ...legacy, workspace_id: "team-a" })).toBe(true);
  expect(inScope(team, legacy)).toBe(false);
  expect(inScope(team, { user_id: "owner" })).toBe(false);
});
