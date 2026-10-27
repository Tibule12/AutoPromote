// Standalone local preview. This file is never mounted by src/server.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSandboxDatabase } = require("../src/services/unifiedCredits/runtime");
const { createWalletService } = require("../src/services/unifiedCredits/wallet");
const { createMockVerifier } = require("../src/services/unifiedCredits/rewardProof");
const { createSandboxApp } = require("../src/routes/unifiedCreditsSandboxRoutes");
const {
  createEmulatorWorker,
  createDispatcher,
} = require("../src/services/unifiedCredits/dispatch");

async function main() {
  const port = Number(process.env.CREDITS_SANDBOX_PORT || 8190);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid sandbox port");
  const db = createSandboxDatabase();
  const policyFile =
    process.env.UNIFIED_CREDITS_CONFIG ||
    path.resolve(__dirname, "../config/unified-credits.sandbox.example.json");
  const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"));
  const verifier = createMockVerifier(crypto.randomBytes(32).toString("hex"));
  const service = createWalletService({ db, policy, verifier });
  await service.initialiseControl();
  await service.enroll("demo-free");
  await service.enroll("demo-premium", { tier: "premium" });
  const origin = `http://127.0.0.1:${port}`;
  const dispatcher = createDispatcher({ db, service, worker: createEmulatorWorker({ db }) });
  const app = createSandboxApp({ service, verifier, dispatcher, origin });
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(`Credits preview: ${origin} (demo emulator only)`)
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(async () => {
        await db.terminate();
        process.exit(0);
      });
    });
}
main().catch(error => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
