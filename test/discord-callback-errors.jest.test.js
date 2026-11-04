jest.mock("../src/services/communityPublishing", () => ({
  ...jest.requireActual("../src/services/communityPublishing"),
  completeDiscord: jest.fn(),
}));
const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");
const service = require("../src/services/communityPublishing");
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false }));
app.use("/api", require("../src/routes/platformRoutes"));
beforeEach(() => jest.clearAllMocks());

test("expired Discord consent identifies expiry without reflecting OAuth parameters", async () => {
  service.completeDiscord.mockRejectedValueOnce(
    Object.assign(new Error("private-provider-response"), { discordCode: "state_expired" })
  );
  const res = await request(app).get(
    "/api/discord/auth/callback?code=private-auth-code&state=private-state"
  );
  expect(res.status).toBe(400);
  expect(res.text).toContain("expired after 10 minutes");
  expect(res.text).toContain("state_expired");
  for (const secret of ["private-provider-response", "private-auth-code", "private-state"])
    expect(res.text).not.toContain(secret);
  expect(res.headers["cache-control"]).toBe("no-store");
  expect(res.headers["referrer-policy"]).toBe("no-referrer");
});
test("token rejection exposes only the safe OAuth error category", async () => {
  service.completeDiscord.mockRejectedValueOnce({
    discordCode: "token_exchange",
    oauthError: "invalid_client",
    message: "private-client-secret",
  });
  const res = await request(app).get("/api/discord/auth/callback?code=fixture&state=fixture");
  expect(res.status).toBe(400);
  expect(res.text).toContain("token_exchange.invalid_client");
  expect(res.text).not.toContain("private-client-secret");
});
test("unknown callback errors and untrusted codes stay private", async () => {
  service.completeDiscord.mockRejectedValueOnce({
    discordCode: "private-oauth-state",
    oauthError: "private-webhook-token",
    message: "private-client-secret",
  });
  const res = await request(app).get("/api/discord/auth/callback?code=fixture&state=fixture");
  expect(res.status).toBe(400);
  expect(res.text).toContain("callback_failed");
  expect(res.text).not.toContain("private-");
});
test("successful authorisation retains the production return URL and sends no token there", async () => {
  service.completeDiscord.mockResolvedValueOnce({ id: "owned-destination" });
  const res = await request(app).get("/api/discord/auth/callback?code=fixture&state=fixture");
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe("https://autopromote.org/?oauth=discord&status=success");
  expect(res.headers["cache-control"]).toBe("no-store");
});
