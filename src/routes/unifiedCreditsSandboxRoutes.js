const express = require("express");
const rateLimit = require("express-rate-limit");
const { assertSandbox } = require("../services/unifiedCredits/runtime");

function createSandboxApp({ service, verifier, dispatcher, origin, now = Date.now }) {
  assertSandbox();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    assertSandbox();
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.set("Cache-Control", "no-store");
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      return res.status(403).json({ error: "SAME_ORIGIN_REQUIRED" });
    }
    next();
  });
  app.use(
    "/api/",
    rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false })
  );
  app.use(express.json({ limit: "8kb" }));
  app.use("/api/", (req, res, next) => {
    // Deliberately simulated identity. No Firebase production tokens are read or accepted.
    const uid = req.headers["x-credits-sandbox-user"];
    if (
      req.headers["x-credits-sandbox"] !== "local" ||
      !["demo-free", "demo-premium"].includes(uid)
    ) {
      return res.status(401).json({ error: "LOCAL_DEMO_IDENTITY_REQUIRED" });
    }
    req.creditUserId = uid;
    next();
  });
  app.get("/api/account", async (req, res) => res.json(await service.getAccount(req.creditUserId)));
  app.get("/api/catalogue", (req, res) =>
    res.json({
      operations: service.policy.operations,
      monthlyCredits: service.policy.monthlyCredits,
      version: service.policy.version,
    })
  );
  app.post("/api/quote", async (req, res) => {
    const quote = service.quote(req.body.operation, req.body.units);
    const account = await service.getAccount(req.creditUserId);
    res.json({ ...quote, canAfford: account.balance >= quote.credits });
  });
  app.post("/api/rewards", async (req, res) => {
    if (req.body.consent !== true) return res.status(400).json({ error: "OPT_IN_REQUIRED" });
    const availability = req.body.availability || "available";
    if (!["available", "no_fill", "unsupported", "blocked", "timeout"].includes(availability))
      return res.status(400).json({ error: "INVALID_AVAILABILITY_FIXTURE" });
    const session = await service.beginReward(req.creditUserId);
    if (availability !== "available") {
      await service.closeReward(req.creditUserId, session.sessionId);
      return res.json({ status: "unavailable", reason: availability, sandbox: true });
    }
    res.json(session);
  });
  app.post("/api/rewards/google-completion", (_req, res) =>
    res.status(403).json({ error: "GOOGLE_WEB_VERIFICATION_UNAVAILABLE" })
  );
  app.post("/api/rewards/:sessionId/close", async (req, res) =>
    res.json(await service.closeReward(req.creditUserId, req.params.sessionId))
  );
  app.post("/api/rewards/:sessionId/mock-completion", async (req, res) => {
    const sessionId = req.params.sessionId;
    // Only the isolated emulator app exposes this simulator. A live provider must supply
    // its own authenticated completion evidence; this endpoint is not a Google callback.
    const proof = verifier.issue({
      userId: req.creditUserId,
      sessionId,
      eventId: `mock-${sessionId}`,
      completedAt: now(),
    });
    res.json(await service.completeReward(proof));
  });
  app.post("/api/operations", async (req, res) => {
    if (!dispatcher) return res.status(503).json({ error: "DEMO_DISPATCHER_REQUIRED" });
    // Only a loopback emulator fixture runs here; production handlers stay unmounted.
    res.json(
      await dispatcher.runMock(req.creditUserId, req.body, req.body.simulateFailure === true)
    );
  });
  app.use((req, res, next) => (req.path.startsWith("/google-test") ? res.sendStatus(404) : next()));
  app.use(express.static(require("path").resolve(__dirname, "../../sandbox/credits")));
  app.use((err, req, res, _next) =>
    res.status(err.status || 500).json({
      error: err.code || "SANDBOX_REQUEST_FAILED",
    })
  );
  return app;
}
module.exports = { createSandboxApp };
