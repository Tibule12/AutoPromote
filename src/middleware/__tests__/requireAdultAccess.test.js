/* eslint-disable no-undef */
const requireAdultAccess = require("../requireAdultAccess");

function makeReq(user) {
  return { user };
}

function runMiddleware(user) {
  return new Promise(resolve => {
    const req = makeReq(user);
    const res = {
      status(code) {
        this._status = code;
        return this;
      },
      json(obj) {
        this._body = obj;
      },
    };
    let called = false;
    const next = () => {
      called = true;
      resolve({ ok: true, req, res });
    };
    // call and resolve after
    requireAdultAccess(req, res, () => next());
    // small timeout to catch sync returns
    setTimeout(() => {
      if (!called) resolve({ ok: false, req, res });
    }, 10);
  });
}

describe("requireAdultAccess middleware", () => {
  test("allows admin user", async () => {
    const r = await runMiddleware({ uid: "u1", isAdmin: true });
    expect(r.ok).toBe(true);
  });

  test("allows kycVerified user", async () => {
    const r = await runMiddleware({ uid: "u2", kycVerified: true });
    expect(r.ok).toBe(true);
  });

  test("allows flagged user", async () => {
    const r = await runMiddleware({ uid: "u3", flags: { afterDarkAccess: true } });
    expect(r.ok).toBe(true);
  });

  test("denies unauthenticated user", async () => {
    const r = await runMiddleware(null);
    expect(r.ok).toBe(false);
    expect(r.res._status).toBe(401);
  });

  test("denies user without kyc or flag", async () => {
    const r = await runMiddleware({ uid: "u4" });
    expect(r.ok).toBe(false);
    expect(r.res._status).toBe(403);
  });
});
