const { maskSecret } = require("../firebase-auth-fix");

describe("maskSecret helper", () => {
  test("masks values correctly", () => {
    expect(maskSecret("abcdef123456", 4)).toBe("***3456");
  });

  test("handles undefined or null", () => {
    expect(maskSecret(null)).toBe("<none>");
    expect(maskSecret(undefined)).toBe("<none>");
  });

  test("masks short values", () => {
    expect(maskSecret("abc", 2)).toBe("***bc");
  });
});
