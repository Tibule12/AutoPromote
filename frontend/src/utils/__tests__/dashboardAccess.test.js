import { getVerifiedSessionUser, shouldShowAdminDashboard } from "../dashboardAccess";

const owner = { uid: "owner", email: "owner@example.com", displayName: "Owner" };
const admin = { ...owner, role: "admin", isAdmin: true };
const ordinary = { ...owner, uid: "customer", role: "user", isAdmin: false };
const response = body => ({ ok: true, json: async () => body });

test.each(["/", "/dashboard", "/?from=login"])(
  "an owner opens the ordinary workspace at %s",
  pathname => {
    expect(shouldShowAdminDashboard(admin, pathname)).toBe(false);
  }
);

test.each(["/admin-dashboard", "/admin-dashboard/", "/admin-login"])(
  "an owner may explicitly enter %s",
  pathname => {
    expect(shouldShowAdminDashboard(admin, pathname)).toBe(true);
    expect(shouldShowAdminDashboard(ordinary, pathname)).toBe(false);
    expect(shouldShowAdminDashboard(null, pathname)).toBe(false);
  }
);

test("restored owner authority comes from the verified backend even without legacy claims", async () => {
  const request = jest.fn().mockResolvedValue(response({ valid: true, user: admin }));
  expect(await getVerifiedSessionUser(owner, "real-fixture-token", request)).toMatchObject({
    uid: "owner",
    role: "admin",
    isAdmin: true,
  });
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining("/api/auth/verify"),
    expect.objectContaining({
      headers: { Authorization: "Bearer real-fixture-token", Accept: "application/json" },
    })
  );
});

test.each([
  { valid: true, user: { ...admin, uid: "someone-else" } },
  { valid: false, user: admin },
  { valid: true, user: { ...admin, role: "user" } },
  { valid: true, user: { ...admin, isAdmin: false } },
])("does not promote an invalid or mismatched verification result %j", async body => {
  const user = await getVerifiedSessionUser(owner, "fixture", async () => response(body));
  expect(user).toMatchObject({ uid: "owner", role: "user", isAdmin: false });
});

test("stale local admin metadata cannot override the current server authority", async () => {
  const user = await getVerifiedSessionUser(
    { ...owner, role: "admin", isAdmin: true },
    "fixture",
    async () =>
      response({
        valid: true,
        user: { uid: "owner", role: "user", isAdmin: false },
      })
  );
  expect(user.role).toBe("user");
  expect(user.isAdmin).toBe(false);
});

test("an unavailable verification service cannot grant admin authority", async () => {
  expect(
    await getVerifiedSessionUser(owner, "fixture", async () => {
      throw new Error("offline");
    })
  ).toMatchObject({ role: "user", isAdmin: false });
  expect(await getVerifiedSessionUser(owner, "fixture", async () => ({ ok: false }))).toMatchObject(
    { role: "user", isAdmin: false }
  );
});
