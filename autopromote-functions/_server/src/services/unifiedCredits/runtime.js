const DEMO_PROJECT = "demo-autopromote-credits";

function assertSandbox(env = process.env, db = null) {
  const host = env.FIRESTORE_EMULATOR_HOST || "";
  const match = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(host);
  if (
    env.UNIFIED_CREDITS_SANDBOX !== "true" ||
    env.UNIFIED_CREDITS_PROJECT_ID !== DEMO_PROJECT ||
    env.NODE_ENV === "production" ||
    env.K_SERVICE ||
    env.FUNCTION_TARGET ||
    env.RENDER_SERVICE_ID ||
    env.RENDER_EXTERNAL_HOSTNAME ||
    String(env.RENDER || "")
      .trim()
      .toLowerCase() === "true" ||
    !match ||
    Number(match[1]) < 1 ||
    Number(match[1]) > 65535 ||
    (db &&
      (db.projectId !== DEMO_PROJECT ||
        `${db._settings?.servicePath}:${db._settings?.port}` !== host ||
        db._settings?.ssl !== false))
  ) {
    throw Object.assign(new Error("Unified credits require the explicit local demo emulator"), {
      code: "SANDBOX_ONLY",
      status: 503,
    });
  }
}

function createSandboxDatabase(env = process.env) {
  assertSandbox(env);
  const { Firestore } = require("firebase-admin/firestore");
  // Explicit host/project; never initialise the application's production Firebase app.
  return new Firestore({ projectId: DEMO_PROJECT, host: env.FIRESTORE_EMULATOR_HOST, ssl: false });
}

module.exports = { DEMO_PROJECT, assertSandbox, createSandboxDatabase };
