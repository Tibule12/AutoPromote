const { isValidWorkspaceInviteEmail } = require("../emailValidation");

describe("isValidWorkspaceInviteEmail", () => {
  it.each([
    "creator@example.com",
    "team.member+studio@sub.example.co.za",
    " OWNER@EXAMPLE.COM ",
  ])("accepts a bounded valid address: %s", email => {
    expect(isValidWorkspaceInviteEmail(email)).toBe(true);
  });

  it.each([
    "",
    "missing-at.example.com",
    "multiple@@example.com",
    ".leading@example.com",
    "trailing.@example.com",
    "member@example",
    "member@-example.com",
    "member@example-.com",
    "member@exam ple.com",
    "<script>@example.com",
  ])("rejects an invalid address: %s", email => {
    expect(isValidWorkspaceInviteEmail(email)).toBe(false);
  });

  it("rejects oversized attacker-controlled input before parsing it", () => {
    const oversized = `${"!@".repeat(100_000)}invalid.example`;
    expect(isValidWorkspaceInviteEmail(oversized)).toBe(false);
  });
});
