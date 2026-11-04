const {
  verificationReturnUrl,
  generateVerificationLink,
  requireVerifiedEmail,
} = require("../utils/emailVerification");

describe("verification links and mandatory verification", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test.each([
    [{}, "https://autopromote.org/#/"],
    [{ FRONTEND_URL: "https://www.autopromote.org" }, "https://autopromote.org/#/"],
    [
      { VERIFY_REDIRECT_URL: "https://www.autopromote.org/verify" },
      "https://autopromote.org/verify",
    ],
    [{ VERIFY_REDIRECT_URL: "javascript:alert(1)" }, "https://autopromote.org/#/"],
    [{ VERIFY_REDIRECT_URL: "https://user:secret@example.com" }, "https://autopromote.org/#/"],
    [{ FRONTEND_URL: "http://localhost:3000", NODE_ENV: "test" }, "http://localhost:3000/#/"],
    [
      { FRONTEND_URL: "http://localhost:3000", NODE_ENV: "production" },
      "https://autopromote.org/#/",
    ],
  ])("uses a valid return URL: %j", (env, expected) => {
    expect(verificationReturnUrl(env)).toBe(expected);
  });

  test("retries a rejected optional return URL once using Firebase's signed hosted action", async () => {
    const auth = {
      generateEmailVerificationLink: jest
        .fn()
        .mockRejectedValueOnce({ code: "auth/unauthorized-continue-uri" })
        .mockResolvedValueOnce("https://demo.firebaseapp.com/__/auth/action?fixture"),
    };
    await expect(generateVerificationLink(auth, "owner@example.test")).resolves.toContain(
      "/__/auth/action"
    );
    expect(auth.generateEmailVerificationLink.mock.calls[1]).toEqual(["owner@example.test"]);
  });
  test.each(["auth/too-many-requests", "auth/user-not-found", "auth/internal-error"])(
    "never retries %s",
    async code => {
      const auth = { generateEmailVerificationLink: jest.fn().mockRejectedValue({ code }) };
      await expect(generateVerificationLink(auth, "owner@example.test")).rejects.toEqual({ code });
      expect(auth.generateEmailVerificationLink).toHaveBeenCalledTimes(1);
    }
  );
  test.each([false, undefined, "true"])("rejects an unverified signed claim %s", email_verified => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    expect(requireVerifiedEmail({ email_verified, admin: true }, res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "email_not_verified" }));
  });
  test("accepts only an actual verified claim", () => {
    const res = { status: jest.fn() };
    expect(requireVerifiedEmail({ email_verified: true }, res)).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
