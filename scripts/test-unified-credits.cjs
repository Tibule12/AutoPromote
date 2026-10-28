const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { once } = require("events");
const { assertSandbox, DEMO_PROJECT } = require("../src/services/unifiedCredits/runtime");

async function main() {
  // Own a fresh ephemeral emulator; never delete data from a pre-existing emulator.
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "test",
    UNIFIED_CREDITS_SANDBOX: "true",
    UNIFIED_CREDITS_PROJECT_ID: DEMO_PROJECT,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  assertSandbox(env);
  const jar =
    process.env.CREDITS_FIRESTORE_JAR ||
    path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar");
  if (!fs.existsSync(jar))
    throw new Error("Install the Firestore emulator first: npx firebase setup:emulators:firestore");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-credits-tests-"));
  const emulator = spawn(
    process.env.CREDITS_JAVA_BIN || "java",
    [
      "-jar",
      jar,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--project_id",
      DEMO_PROJECT,
      "--rules",
      path.resolve(__dirname, "../test/unified-credits/firestore.rules"),
    ],
    { env, cwd: scratch }
  );
  let log = "",
    exited = false;
  emulator.on("exit", () => {
    exited = true;
  });
  emulator.on("error", error => {
    log += error.message;
    exited = true;
  });
  for (const stream of [emulator.stdout, emulator.stderr])
    stream.on("data", data => {
      log = (log + data).slice(-12000);
    });
  let tests;
  const stop = () => {
    tests?.kill("SIGTERM");
    emulator.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150 && !exited; attempt++) {
      try {
        const response = await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/`, {
          signal: AbortSignal.timeout(500),
        });
        ready = response.ok;
      } catch {
        /* Starting. */
      }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Firestore emulator did not start. Java 21+ is required.\n${log}`);
    tests = spawn(
      process.execPath,
      [
        "--test",
        "--test-concurrency=1",
        ...(process.argv.includes("--application-only")
          ? ["test/unified-credits/application.integration.test.cjs"]
          : [
              "test/unified-credits/foundation.test.cjs",
              "test/unified-credits/continuation.test.cjs",
              "test/unified-credits/google-controller.test.cjs",
              "test/unified-credits/application.integration.test.cjs",
              "test/unified-credits/worker-verification.test.cjs",
              "test/unified-credits/frontend-admission.test.cjs",
              "test/unified-credits/http-boundaries.test.cjs",
            ]),
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env,
        stdio: "inherit",
      }
    );
    const [code] = await once(tests, "exit");
    process.exitCode = Number.isInteger(code) ? code : 1;
    if (code === 0 && process.argv.includes("--browser")) {
      tests = spawn(process.execPath, ["scripts/credits-browser-check.cjs"], {
        cwd: path.resolve(__dirname, ".."),
        env,
        stdio: "inherit",
      });
      const [browserCode] = await once(tests, "exit");
      process.exitCode = Number.isInteger(browserCode) ? browserCode : 1;
    }
  } finally {
    stop();
    if (!exited) await once(emulator, "exit");
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
