// Check the real packaging copier without importing Firebase or deploying anything.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
it("packages the repaired authority helper and application sources without stale copies", () => {
  const root = path.resolve(__dirname, "../..");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-security-package-"));
  try {
    for (const name of [
      "src",
      "lib",
      "package.json",
      "firebaseAdmin.js",
      "firebaseClient.js",
      "firebaseConfig.server.js",
    ]) {
      if (fs.existsSync(path.join(root, name)))
        fs.cpSync(path.join(root, name), path.join(scratch, name), { recursive: true });
    }
    fs.mkdirSync(path.join(scratch, "autopromote-functions"));
    fs.copyFileSync(
      path.join(root, "autopromote-functions/copy-server.js"),
      path.join(scratch, "autopromote-functions/copy-server.js")
    );
    execFileSync(process.execPath, [path.join(scratch, "autopromote-functions/copy-server.js")], {
      stdio: "pipe",
    });
    for (const file of [
      "authMiddleware.js",
      "authRoutes.js",
      "server.js",
      "userController.js",
      "userRoutes.js",
      "utils/authAuthority.js",
      // Application routes now import these guarded helpers even when the
      // emulator-only credit integration is disabled. Packaging must retain them.
      "services/unifiedCredits/application.js",
      "services/unifiedCredits/runtime.js",
      "services/unifiedCredits/workerTransport.js",
    ]) {
      assert.deepEqual(
        fs.readFileSync(path.join(scratch, "autopromote-functions/_server/src", file)),
        fs.readFileSync(path.join(root, "src", file))
      );
    }
    const { assertSandbox } = require(
      path.join(scratch, "autopromote-functions/_server/src/services/unifiedCredits/runtime.js")
    );
    const demo = {
      UNIFIED_CREDITS_SANDBOX: "true",
      UNIFIED_CREDITS_PROJECT_ID: "demo-autopromote-credits",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8188",
    };
    for (const hosted of [
      { NODE_ENV: "production" },
      { K_SERVICE: "functions" },
      { RENDER: "true" },
    ])
      assert.throws(() => assertSandbox({ ...demo, ...hosted }), { code: "SANDBOX_ONLY" });
    assert.equal(fs.existsSync(path.join(scratch, "src/services/unifiedCredits/runtime.js")), true);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
