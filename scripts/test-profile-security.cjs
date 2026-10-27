const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { once } = require("events");
const { isHostedRuntime } = require("../src/utils/authAuthority");
const DEMO_PROJECT = "demo-autopromote-security";
function assertSandbox(env) {
  if (
    env.SECURITY_TEST_PROJECT !== DEMO_PROJECT ||
    !/^127\.0\.0\.1:[0-9]+$/.test(env.FIRESTORE_EMULATOR_HOST || "") ||
    isHostedRuntime(env)
  ) {
    throw new Error("Security tests require a local demo emulator");
  }
}

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
    SECURITY_TEST_PROJECT: DEMO_PROJECT,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  assertSandbox(env);
  const cacheDir = path.join(os.homedir(), ".cache/firebase/emulators");
  const cachedJar = fs.existsSync(cacheDir)
    ? fs
        .readdirSync(cacheDir)
        .filter(name => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
    : null;
  const jar =
    process.env.SECURITY_FIRESTORE_JAR || (cachedJar ? path.join(cacheDir, cachedJar) : "");
  if (!fs.existsSync(jar))
    throw new Error("Install the Firestore emulator first: npx firebase setup:emulators:firestore");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-security-tests-"));
  const emulator = spawn(
    process.env.SECURITY_JAVA_BIN || "java",
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
      path.resolve(__dirname, "../config/security/firestore.owner-scoped.rules"),
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
        "test/security/profile-security.test.cjs",
        "test/security/admin-authority-review.test.cjs",
        "test/security/functions-copy.test.cjs",
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env,
        stdio: "inherit",
      }
    );
    const [code] = await once(tests, "exit");
    process.exitCode = Number.isInteger(code) ? code : 1;
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
