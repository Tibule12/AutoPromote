const router = require("../src/snapchatRoutes");

describe("snapchat scope normalization", () => {
  const normalizeScopes = router.normalizeScopes;

  test("alias display_name maps to canonical URL", () => {
    const { scopeList, scope } = normalizeScopes("display_name");
    expect(Array.isArray(scopeList)).toBe(true);
    expect(scopeList.length).toBe(1);
    expect(scopeList[0]).toMatch(/user.display_name/);
    expect(scope).toBe(scopeList[0]);
  });

  test("multiple aliases space-separated", () => {
    const { scopeList, scope } = normalizeScopes("display_name external_id");
    expect(scopeList.length).toBe(2);
    expect(scope).toBe(scopeList.join(" "));
  });

  test("comma separated aliases and bitmoji alias", () => {
    const { scopeList } = normalizeScopes("display_name,bitmoji.avatar");
    expect(scopeList.length).toBe(2);
    expect(scopeList.find(s => s.includes("user.bitmoji.avatar"))).toBeDefined();
  });

  test("full URL accepted", () => {
    const url = "https://auth.snapchat.com/oauth2/api/user.display_name";
    const { scopeList, scope } = normalizeScopes(url);
    expect(scopeList.length).toBe(1);
    expect(scopeList[0]).toBe(url);
    expect(scope).toBe(url);
  });

  test("unknown tokens produce empty result", () => {
    const { scopeList } = normalizeScopes("not-a-scope");
    expect(scopeList.length).toBe(0);
  });
});
