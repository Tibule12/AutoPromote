// Own a fresh demo emulator. Never discover or seed a running/cloud database.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
async function main() {
  const { isHostedRuntime } = require("../src/utils/authAuthority");
  if (isHostedRuntime()) throw new Error("Community publishing tests are local only");
  const probe = net.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-team-workspace-tests-"));
  const env = {
    ...process.env,
    NODE_ENV: "test",
    TEAM_TEST_PROJECT: "demo-autopromote-team",
    GCLOUD_PROJECT: "demo-autopromote-team",
    TEAM_WORKSPACE_QA: "true",
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FIREBASE_CONFIG"])
    delete env[key];
  const jar =
    process.env.SECURITY_FIRESTORE_JAR ||
    path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar");
  if (!fs.existsSync(jar)) throw new Error("Cached Firestore emulator required");
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
      env.TEAM_TEST_PROJECT,
      "--rules",
      path.resolve(__dirname, "../firestore.rules"),
    ],
    { env, cwd: scratch }
  );
  let log = "",
    child,
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
      log = (log + data).slice(-8000);
    });
  const stop = () => {
    child?.kill("SIGTERM");
    emulator.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let i = 0; i < 150 && !exited; i++) {
      try {
        ready = (await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}`)).ok;
      } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Emulator failed to start: ${log}`);
    child = spawn(process.execPath, ["--test", "test/team-workspace.integration.test.cjs"], {
      env,
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });
    const [code] = await once(child, "exit");
    process.exitCode = code || 0;
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
